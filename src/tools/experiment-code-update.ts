import { z } from "zod";
import { generateText, stepCountIs, tool } from "ai";
import { logger } from "@/lib/logger";
import { anthropic } from "@ai-sdk/anthropic";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import OpenAI from "openai";
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

7. **MANDATORY - Verify Build**: Run the build command to verify changes don't break the build
   - For npm projects: \`npm run build\`
   - For pnpm projects: \`pnpm build\`
   - **If build fails**: Review errors, fix issues, and retry build
   - **DO NOT proceed to step 8 unless build succeeds**

8. **MANDATORY - Commit Changes**: Create a commit with a descriptive message about the A/B test implementation
   - Use git add to stage changes
   - Use git commit with clear message (e.g., "Add PostHog feature flag for [hypothesis]")

9. **MANDATORY - Push Changes**: Push the committed changes to the remote repository
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
import { usePostHog } from 'posthog-js/react'
import { useEffect, useState } from 'react'

const posthog = usePostHog()
const [text, setText] = useState('')

useEffect(() => {
  const variant = posthog.getFeatureFlag('flag-key')
  setText(variant === 'test' ? 'Test variant' : 'Control variant')
}, [])
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
- MUST run build command before committing (verify changes don't break the build)
- MUST commit changes with descriptive message
- MUST push changes to remote repository

## Success Criteria - YOU MUST COMPLETE ALL OF THESE

Your task is NOT complete until ALL of the following are true:

✓ Build Command Executed: You have run the build command (npm run build or pnpm build)
✓ Build Passed: The build completed successfully with no errors
✓ Changes Committed: You have committed changes using git add and git commit
✓ Changes Pushed: You have pushed changes to remote using git push
✓ Push Verified: You have confirmed the push succeeded

## Final Report - REQUIRED

At the end of your execution, you MUST provide a summary that includes:

1. **Build Status**: Report whether the build passed or failed
2. **Commit Status**: Confirm that changes were committed (include commit message)
3. **Push Status**: Confirm that changes were pushed to remote
4. **Files Modified**: List the files that were changed

If ANY of the mandatory steps (build, commit, push) failed, you MUST:
- Clearly state which step failed
- Explain what went wrong
- Report the error message
- DO NOT claim success if any mandatory step failed
`;

export const experimentCodeUpdateTool = tool({
  description: "Automates adding PostHog feature flag code to a GitHub repository for A/B testing. Clones the repo, analyzes the codebase, installs dependencies if needed, adds feature flag implementation, verifies the build succeeds, and commits changes.",
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
    logger.info("Experiment code update tool invoked", {
      githubUrl,
      featureFlagKey,
      hypothesis: hypothesis.substring(0, 100),
      copyVariant: copyVariant.substring(0, 100),
    });

    try {
      logger.info("Starting sub-agent with generateText");

      const result = await generateText({
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
            textPreview: text ? text.substring(0, 200) : "(no text)",
            toolCallsCount: toolCalls?.length || 0,
            finishReason,
            usage,
          });

          // Log each tool call in detail
          toolCalls?.forEach((call, idx) => {
            logger.info(`Sub-agent tool call ${idx + 1}`, {
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
              toolName: result.toolName,
              result: resultPreview,
            });
          });
        },
      });

      logger.info("Experiment code update completed successfully", {
        resultLength: result.text.length,
        textPreview: result.text.substring(0, 200),
      });

      return result.text;
    } catch (error) {
      logger.error("Failed to update experiment code", {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : String(error),
        githubUrl,
        featureFlagKey,
      });
      throw new Error(`Code update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
