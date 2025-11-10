import { z } from "zod";
import { streamText, stepCountIs, tool } from "ai";
import { logger } from "@/lib/logger";
import { anthropic } from "@ai-sdk/anthropic";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import OpenAI from "openai";
import crypto from "crypto";
import { progressStore } from "@/lib/progress-store";
import fileUpdateToolDescription from "./file-update-tool.md";

const execAsync = promisify(exec);
const morphClient = new OpenAI({
  apiKey: process.env.MORPH_LLM_API_KEY,
  baseURL: "https://api.morphllm.com/v1",
});

// Wrapper to parse stringified JSON arguments from Anthropic SDK
function createToolWithParsedArgs(tool: any) {
  return {
    ...tool,
    execute: async (args: any) => {
      // Parse view_range if it's a stringified array
      if (args.view_range && typeof args.view_range === 'string') {
        try {
          args.view_range = JSON.parse(args.view_range);
        } catch (e) {
          // If parsing fails, leave it as-is
          logger.warn("Failed to parse view_range", {
            view_range: args.view_range,
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }
      return tool.execute(args);
    }
  };
}

const bashTool = anthropic.tools.bash_20250124({
  execute: async ({ command, restart }) => {
    logger.info("Bash tool executing command", { command });

    const allowedCommands = ["ls", "grep", "cat", "find", "git", "mkdir", "cd", "npm", "pnpm"];
    const forbiddenGitConfigPatterns = [
      "git config user.email",
      "git config --global user.email",
      "git config user.name",
      "git config --global user.name",
    ];
    const baseCommand = command.trim().split(/\s+/)[0];

    if (!allowedCommands.includes(baseCommand)) {
      const errorMsg = `Command '${baseCommand}' is not allowed. Only ${allowedCommands.join(", ")} are permitted.`;
      logger.error("Bash tool command not allowed", {
        command,
        baseCommand,
        allowedCommands
      });
      throw new Error(errorMsg);
    }

    if (forbiddenGitConfigPatterns.some((pattern) => command.includes(pattern))) {
      const errorMsg = "Commands that modify git user.name or user.email are forbidden. Use the existing repository configuration.";
      logger.error("Bash tool command forbidden", {
        command,
        forbiddenPatterns: forbiddenGitConfigPatterns,
      });
      throw new Error(errorMsg);
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10,
      });

      const output = stdout || stderr;
      logger.info("Bash tool command completed", {
        command,
        outputLength: output.length,
        outputPreview: output.substring(0, 500),
      });

      return output;
    } catch (error) {
      logger.error("Bash tool command failed", {
        command,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : String(error),
      });
      throw error;
    }
  },
});

const textEditorTool = createToolWithParsedArgs(
  anthropic.tools.textEditor_20250728({
    execute: async ({
      command,
      path,
      file_text,
      old_str,
      new_str,
      insert_line,
      view_range,
    }) => {
      logger.info("Text editor tool executing", { command, path, view_range });

      try {
        if (command === "view") {
          const content = await fs.readFile(path, "utf-8");
          const lines = content.split("\n");

          if (view_range) {
            const [start, end] = view_range;
            const selectedLines = lines.slice(start - 1, end);
            const result = selectedLines.join("\n");
            logger.info("Text editor tool view completed", {
              path,
              viewRange: view_range,
              linesReturned: selectedLines.length,
              contentPreview: result.substring(0, 200),
            });
            return result;
          }

          logger.info("Text editor tool view completed", {
            path,
            totalLines: lines.length,
            contentLength: content.length,
          });
          return content;
        }

        if (command === "create") {
          await fs.writeFile(path, file_text || "", "utf-8");
          const result = `Created ${path}`;
          logger.info("Text editor tool create completed", {
            path,
            fileTextLength: (file_text || "").length,
          });
          return result;
        }

        if (command === "str_replace") {
          let content = await fs.readFile(path, "utf-8");

          if (!old_str) {
            const error = new Error("old_str is required for str_replace command");
            logger.error("Text editor tool str_replace failed", {
              path,
              reason: "old_str is required",
            });
            throw error;
          }

          if (!content.includes(old_str)) {
            const error = new Error(`old_str not found in ${path}`);
            logger.error("Text editor tool str_replace failed", {
              path,
              reason: "old_str not found",
              oldStrPreview: old_str.substring(0, 100),
            });
            throw error;
          }

          content = content.replace(old_str, new_str || "");
          await fs.writeFile(path, content, "utf-8");
          const result = `Replaced content in ${path}`;
          logger.info("Text editor tool str_replace completed", {
            path,
            oldStrLength: old_str.length,
            newStrLength: (new_str || "").length,
          });
          return result;
        }

        const error = new Error(`Unknown command: ${command}`);
        logger.error("Text editor tool unknown command", { command, path });
        throw error;
      } catch (error) {
        logger.error("Text editor tool execution failed", {
          command,
          path,
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
          } : String(error),
        });
        throw error;
      }
    },
  })
);

const fileUpdateTool = tool({
  description: fileUpdateToolDescription,
  inputSchema: z.object({
    instruction: z
      .string()
      .describe("Brief description of what you're changing"),
    code: z
      .string()
      .describe("The entire original code before edits are applied"),
    codeEdit: z
      .string()
      .describe(
        "Code snippet showing only the changes with // ... existing code ... markers",
      ),
  }),
  execute: async ({ instruction, code, codeEdit }) => {
    logger.info("File update tool executing", {
      instruction,
      codeLength: code.length,
      codeEditLength: codeEdit.length,
    });

    try {
      const response = await morphClient.chat.completions.create({
        model: "morph-v3-fast",
        messages: [
          {
            role: "user",
            content: `<instruction>${instruction}</instruction>\n<code>${code}</code>\n<update>${codeEdit}</update>`,
          },
        ],
      });

      const mergedCode = response.choices[0].message.content;
      logger.info("File update tool completed", {
        instruction,
        originalCodeLength: code.length,
        mergedCodeLength: mergedCode?.length || 0,
      });

      return mergedCode;
    } catch (error) {
      logger.error("File update tool failed", {
        instruction,
        codeLength: code.length,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : String(error),
      });
      throw error;
    }
  },
});

// Helper to detect progress stages based on tool calls and text
function detectProgressStage(toolCalls: any[], text: string): string | null {
  if (!toolCalls || toolCalls.length === 0) {
    // Check text for hints when no tool calls
    const lowerText = text.toLowerCase();
    if (lowerText.includes("cloning") || lowerText.includes("git clone")) {
      return "Cloning repository...";
    } else if (lowerText.includes("analyzing") || lowerText.includes("reading package.json") || lowerText.includes("checking readme")) {
      return "Analyzing codebase...";
    } else if (lowerText.includes("installing") && (lowerText.includes("dependencies") || lowerText.includes("packages"))) {
      return "Installing dependencies...";
    } else if (lowerText.includes("installing posthog")) {
      return "Installing PostHog SDK...";
    }
    return null;
  }

  for (const call of toolCalls) {
    if (call.toolName === "bash") {
      const command = 'args' in call ? call.args?.command : call.command;
      if (!command) continue;

      if (command.includes("git clone")) {
        return "Cloning repository...";
      } else if (command.includes("npm install") || command.includes("pnpm install") || command.includes("yarn install")) {
        // Check if it's PostHog or general dependencies
        if (command.includes("posthog")) {
          return "Installing PostHog SDK...";
        }
        return "Installing dependencies...";
      } else if (command.includes("git add")) {
        return "Staging changes...";
      } else if (command.includes("git commit")) {
        return "Committing changes...";
      } else if (command.includes("git push")) {
        return "Pushing to remote...";
      } else if (command.includes("cat") || command.includes("grep") || command.includes("find")) {
        return "Analyzing codebase...";
      }
    } else if (call.toolName === "textEditor" || call.toolName === "textEditorTool") {
      const commandType = 'args' in call ? call.args?.command : call.command;
      const path = 'args' in call ? call.args?.path : call.path;

      if (commandType === "view") {
        // Reading package.json or README indicates analyzing
        if (path && (path.includes("package.json") || path.includes("README") || path.includes("readme"))) {
          return "Analyzing codebase...";
        }
        return "Locating target files...";
      } else if (commandType === "str_replace" || commandType === "create") {
        return "Adding feature flag code...";
      }
    } else if (call.toolName === "fileUpdateTool") {
      return "Adding feature flag code...";
    }
  }

  return null;
}

const EXPERIMENT_CODE_UPDATE_AGENT_PROMPT = `You are an AI agent that automates adding PostHog feature flag code to GitHub repositories for A/B testing.

## Your Workflow (MUST COMPLETE ALL STEPS IN ORDER)

**CRITICAL**: You MUST complete ALL steps below. Steps 7-9 are MANDATORY and cannot be skipped.

1. **Clone Repository**: Clone the GitHub repository into a new folder called 'posthog-experiments' (try ~/Documents/posthog-experiments first, fallback to /tmp/posthog-experiments if ~/Documents doesn't exist or is not accessible)

2. **Analyze Codebase**: Analyze the codebase (README, package.json, etc.) to detect language, framework, and dependencies

3. **Install Dependencies**: Check if dependencies are installed; if not, install using the correct package manager:
   - Check for pnpm-lock.yaml → use pnpm
   - Check for package-lock.json → use npm
   - Run install command if node_modules is missing

4. **Locate Target Files**: Locate target files based on the hypothesis

5. **Install PostHog SDK**: Install appropriate PostHog SDK if needed (using the detected package manager)

6. **Apply Feature Flag Code**: Generate and apply feature flag code

7. **MANDATORY - Commit Changes**: Create a commit with a descriptive message about the A/B test implementation
   - Use git add to stage changes
   - Use git commit with clear message (e.g., "Add PostHog feature flag for [hypothesis]")
   - Do **not** run git config user.name or git config user.email; rely on the repository's existing identity

8. **MANDATORY - Push Changes**: Push the committed changes to the remote repository
   - Use git push to push to the remote
   - Verify the push succeeded

## PostHog Feature Flag Patterns

### JavaScript/TypeScript (Browser)
\`\`\`javascript
import posthog from 'posthog-js'
posthog.init('<key>', { api_host: 'https://us.i.posthog.com' })
const variant = posthog.getFeatureFlag('flag-key')
if (variant === 'test') { /* test variant */ } else { /* control variant */ }
\`\`\`

### React
\`\`\`javascript
import { useFeatureFlagVariantKey } from 'posthog-js/react'
const variant = useFeatureFlagVariantKey('flag-key')
if (variant === 'test') { /* test variant */ } else { /* control variant */ }
\`\`\`

### Next.js (Client)
\`\`\`javascript
'use client'
import { useFeatureFlagVariantKey, usePostHog } from 'posthog-js/react'

const posthog = usePostHog()
const variant = useFeatureFlagVariantKey('flag-key')
const isTestVariant = variant === 'test'
const text = isTestVariant ? 'Test Variant Text' : 'Control Variant Text'
\`\`\`

### Next.js (Server)
\`\`\`javascript
import { PostHog } from 'posthog-node'
const posthog = new PostHog('<key>', { host: 'https://us.i.posthog.com' })
const flags = await posthog.getAllFlags('user-id')
const variant = flags['flag-key']
if (variant === 'test') { /* test variant */ }
\`\`\`

### Python
\`\`\`python
from posthog import Posthog
posthog = Posthog('<key>', host='https://us.i.posthog.com')
variant = posthog.get_feature_flag('flag-key', 'user-id')
if variant == 'test': # test variant
\`\`\`

### Node.js
\`\`\`javascript
const { PostHog } = require('posthog-node')
const posthog = new PostHog('<key>', { host: 'https://us.i.posthog.com' })
const flags = await posthog.getAllFlags('user-id')
const variant = flags['flag-key']
if (variant === 'test') { /* test variant */ }
\`\`\`

## SDK Installation Commands

- JavaScript/TypeScript (client): \`posthog-js\`
- Node.js/Next.js (server): \`posthog-node\`
- Python: \`posthog\`
- React: \`posthog-js\` (with React hooks)

## Using Text Variants

When a test variant text is provided:
- Locate the original text/copy in the target file
- Wrap it in a feature flag conditional
- For the 'test' variant: render the provided test variant text
- For the 'control' variant: keep the original text
- Preserve all surrounding code structure and styling

## Available Tools

- **bash**: Execute bash commands (ls, grep, cat, find, git, mkdir, cd, npm, pnpm only)
- **textEditorTool**: View, create, and edit files
- **fileUpdateTool**: Apply intelligent code merges using MorphLLM

## Critical Requirements

- Read README/package.json first to identify language and framework
- Detect package manager by checking for lock files (pnpm-lock.yaml → pnpm, package-lock.json → npm)
- Install dependencies if node_modules is missing (using detected package manager)
- Check if PostHog is already initialized to avoid duplicates
- Use language-appropriate feature flag patterns
- Keep code changes minimal and focused
- Include clear comments explaining the A/B test logic
- MUST commit changes with descriptive message
- MUST NOT run git config user.name or git config user.email commands; use the repository's existing configuration
- MUST push changes to remote repository
- MUST push verified

## Success Criteria - YOU MUST COMPLETE ALL OF THESE

Your task is NOT complete until ALL of the following are true:

✓ Changes Committed: You have committed changes using git add and git commit
✓ Changes Pushed: You have pushed changes to remote using git push
✓ Push Verified: You have confirmed the push succeeded

## Final Report - REQUIRED

At the end of your execution, you MUST provide a summary that includes:

✓ Commit Status: Confirm that changes were committed (include commit message)
✓ Push Status: Confirm that changes were pushed to remote
✓ Files Modified: List the files that were changed
`;

export const experimentCodeUpdateTool = tool({
  description: "Automates adding PostHog feature flag code to a GitHub repository for A/B testing. Clones the repo, analyzes the codebase, installs dependencies if needed, adds feature flag implementation, and commits changes.",
  inputSchema: z.object({
    githubUrl: z.string()
      .url()
      .describe("A github url to clone the code"),
    featureFlagKey: z
      .string()
      .regex(/^[a-z0-9-]+$/, "Feature flag key must be lowercase alphanumeric with hyphens")
      .describe("The feature flag key used to identify the experiment"),
    hypothesis: z.string()
      .min(10, "Hypothesis must be at least 10 characters")
      .describe("The hypothesis of the experiment"),
    copyVariant: z.string()
      .min(1, "Copy variant text is required")
      .describe("The text variation to use for the test variant. This will be displayed when the feature flag returns 'test'."),
  }),
  execute: async ({ githubUrl, featureFlagKey, hypothesis, copyVariant }): Promise<string> => {
    // Generate unique execution ID
    const executionId = crypto.randomUUID();

    // Create input hash for tracking
    const inputHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ githubUrl, featureFlagKey, hypothesis, copyVariant }))
      .digest("hex");

    logger.info("Experiment code update tool invoked", {
      executionId,
      inputHash,
      githubUrl,
      featureFlagKey,
      hypothesis: hypothesis.substring(0, 100),
      copyVariant: copyVariant.substring(0, 100),
    });

    // Create progress execution with input hash mapping
    progressStore.create(executionId, inputHash);
    progressStore.update(executionId, "Starting experiment code update...");

    try {
      logger.info("Starting sub-agent with streamText", { executionId });

      // Track reported stages with timestamps to avoid spam but allow legitimate repeats
      const reportedStages = new Map<string, number>();
      const STAGE_COOLDOWN_MS = 2000; // Don't report same stage within 2 seconds

      const result = streamText({
        model: anthropic("claude-sonnet-4-5"),
        prompt: `${EXPERIMENT_CODE_UPDATE_AGENT_PROMPT}

## Your Task

GitHub URL: ${githubUrl}
Feature Flag Key: ${featureFlagKey}
Hypothesis: ${hypothesis}
Test Variant Text: ${copyVariant}

Follow the workflow above to add the PostHog feature flag code to the repository.
When implementing the feature flag conditional, use the provided test variant text for the 'test' branch.
`,
        tools: {
          bash: bashTool,
          fileUpdateTool,
          textEditorTool,
        },
        stopWhen: stepCountIs(50),
        onStepFinish: ({ text, toolCalls, toolResults, finishReason, usage }) => {
          logger.info("Sub-agent step completed", {
            executionId,
            textPreview: text ? text.substring(0, 200) : "(no text)",
            toolCallsCount: toolCalls?.length || 0,
            finishReason,
            usage,
          });

          // Detect and report progress stage
          const stage = detectProgressStage(toolCalls || [], text || "");
          if (stage) {
            const now = Date.now();
            const lastReported = reportedStages.get(stage);

            // Report if never reported or cooldown has passed
            if (!lastReported || (now - lastReported) > STAGE_COOLDOWN_MS) {
              progressStore.update(executionId, stage);
              reportedStages.set(stage, now);
            }
          }

          // Log each tool call in detail
          toolCalls?.forEach((call, idx) => {
            logger.info(`Sub-agent tool call ${idx + 1}`, {
              executionId,
              toolName: call.toolName,
              args: 'args' in call ? call.args : call,
            });
          });

          // Log each tool result in detail
          toolResults?.forEach((result, idx) => {
            const resultValue = 'result' in result ? result.result : result;
            const resultPreview = typeof resultValue === 'string'
              ? resultValue.substring(0, 500)
              : JSON.stringify(resultValue).substring(0, 500);

            logger.info(`Sub-agent tool result ${idx + 1}`, {
              executionId,
              toolName: result.toolName,
              result: resultPreview,
            });
          });
        },
      });

      // Collect full result from stream
      let fullText = "";
      for await (const chunk of result.textStream) {
        fullText += chunk;
      }

      logger.info("Experiment code update completed successfully", {
        executionId,
        resultLength: fullText.length,
        textPreview: fullText.substring(0, 200),
      });

      // Mark as complete
      progressStore.complete(executionId, true);

      // Return structured data with executionId
      return JSON.stringify({
        executionId,
        result: fullText,
      });
    } catch (error) {
      logger.error("Failed to update experiment code", {
        executionId,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : String(error),
        githubUrl,
        featureFlagKey,
      });

      // Mark as complete with error
      progressStore.complete(executionId, false);

      throw new Error(`Code update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
