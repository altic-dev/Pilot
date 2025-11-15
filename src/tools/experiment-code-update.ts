import { z } from "zod";
import { streamText, stepCountIs, tool } from "ai";
import { logger } from "@/lib/logger";
import { anthropic } from "@ai-sdk/anthropic";
import OpenAI from "openai";
import crypto from "crypto";
import { progressStore } from "@/lib/progress-store";
import fileUpdateToolDescription from "./file-update-tool.md";
import * as docker from "@/lib/docker";

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

/**
 * Create tools that operate within a Docker container
 */
function createDockerTools(sessionId: string) {
  const bashTool = anthropic.tools.bash_20250124({
    execute: async ({ command, restart }) => {
      logger.info("Docker bash tool executing command", { sessionId, command });

      const allowedCommands = ["ls", "grep", "cat", "find", "git", "mkdir", "cd", "npm", "pnpm", "gh"];
      const forbiddenGitConfigPatterns = [
        "git config user.email",
        "git config --global user.email",
        "git config user.name",
        "git config --global user.name",
      ];
      const baseCommand = command.trim().split(/\s+/)[0];

      if (!allowedCommands.includes(baseCommand)) {
        const errorMsg = `Command '${baseCommand}' is not allowed. Only ${allowedCommands.join(", ")} are permitted.`;
        logger.error("Docker bash tool command not allowed", {
          sessionId,
          command,
          baseCommand,
          allowedCommands
        });
        throw new Error(errorMsg);
      }

      if (forbiddenGitConfigPatterns.some((pattern) => command.includes(pattern))) {
        const errorMsg = "Commands that modify git user.name or user.email are forbidden. Use the existing repository configuration.";
        logger.error("Docker bash tool command forbidden", {
          sessionId,
          command,
          forbiddenPatterns: forbiddenGitConfigPatterns,
        });
        throw new Error(errorMsg);
      }

      try {
        const { stdout, stderr, exitCode } = await docker.execCommand(
          sessionId,
          ['/bin/sh', '-c', command]
        );

        const output = stdout || stderr;
        logger.info("Docker bash tool command completed", {
          sessionId,
          command,
          exitCode,
          outputLength: output.length,
          outputPreview: output.substring(0, 500),
        });

        if (exitCode !== 0 && stderr) {
          throw new Error(stderr);
        }

        return output;
      } catch (error) {
        logger.error("Docker bash tool command failed", {
          sessionId,
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
        logger.info("Docker text editor tool executing", { sessionId, command, path, view_range });

        try {
          if (command === "view") {
            const content = await docker.readFile(sessionId, path);
            const lines = content.split("\n");

            if (view_range) {
              const [start, end] = view_range;
              const selectedLines = lines.slice(start - 1, end);
              const result = selectedLines.join("\n");
              logger.info("Docker text editor tool view completed", {
                sessionId,
                path,
                viewRange: view_range,
                linesReturned: selectedLines.length,
                contentPreview: result.substring(0, 200),
              });
              return result;
            }

            logger.info("Docker text editor tool view completed", {
              sessionId,
              path,
              totalLines: lines.length,
              contentLength: content.length,
            });
            return content;
          }

          if (command === "create") {
            await docker.writeFile(sessionId, path, file_text || "");
            const result = `Created ${path}`;
            logger.info("Docker text editor tool create completed", {
              sessionId,
              path,
              fileTextLength: (file_text || "").length,
            });
            return result;
          }

          if (command === "str_replace") {
            let content = await docker.readFile(sessionId, path);

            if (!old_str) {
              const error = new Error("old_str is required for str_replace command");
              logger.error("Docker text editor tool str_replace failed", {
                sessionId,
                path,
                reason: "old_str is required",
              });
              throw error;
            }

            if (!content.includes(old_str)) {
              const error = new Error(`old_str not found in ${path}`);
              logger.error("Docker text editor tool str_replace failed", {
                sessionId,
                path,
                reason: "old_str not found",
                oldStrPreview: old_str.substring(0, 100),
              });
              throw error;
            }

            content = content.replace(old_str, new_str || "");
            await docker.writeFile(sessionId, path, content);
            const result = `Replaced content in ${path}`;
            logger.info("Docker text editor tool str_replace completed", {
              sessionId,
              path,
              oldStrLength: old_str.length,
              newStrLength: (new_str || "").length,
            });
            return result;
          }

          const error = new Error(`Unknown command: ${command}`);
          logger.error("Docker text editor tool unknown command", { sessionId, command, path });
          throw error;
        } catch (error) {
          logger.error("Docker text editor tool execution failed", {
            sessionId,
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
        sessionId,
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
          sessionId,
          instruction,
          originalCodeLength: code.length,
          mergedCodeLength: mergedCode?.length || 0,
        });

        return mergedCode;
      } catch (error) {
        logger.error("File update tool failed", {
          sessionId,
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

  // Git-specific tools for better control
  const gitCloneTool = tool({
    description: "Clone a GitHub repository into the container workspace",
    inputSchema: z.object({
      url: z.string().url().describe("The GitHub repository URL to clone"),
      directory: z.string().optional().describe("Optional directory name for the cloned repo"),
    }),
    execute: async ({ url, directory }) => {
      logger.info("Git clone tool executing", { sessionId, url, directory });

      const cloneCommand = directory ? `git clone ${url} ${directory}` : `git clone ${url}`;
      const { stdout, stderr, exitCode } = await docker.execCommand(
        sessionId,
        ['/bin/sh', '-c', cloneCommand]
      );

      if (exitCode !== 0) {
        throw new Error(`Git clone failed: ${stderr}`);
      }

      return `Successfully cloned ${url}${directory ? ` into ${directory}` : ''}`;
    },
  });

  const gitAddTool = tool({
    description: "Stage files for commit using git add",
    inputSchema: z.object({
      files: z.string().describe("Files to stage (e.g., '.' for all, or specific file paths)"),
      workingDir: z.string().describe("The git repository directory"),
    }),
    execute: async ({ files, workingDir }) => {
      logger.info("Git add tool executing", { sessionId, files, workingDir });

      const { stdout, stderr, exitCode } = await docker.execCommand(
        sessionId,
        ['/bin/sh', '-c', `git add ${files}`],
        workingDir
      );

      if (exitCode !== 0) {
        throw new Error(`Git add failed: ${stderr}`);
      }

      return `Successfully staged ${files}`;
    },
  });

  const gitCommitTool = tool({
    description: "Create a git commit with the staged changes",
    inputSchema: z.object({
      message: z.string().describe("Commit message"),
      workingDir: z.string().describe("The git repository directory"),
    }),
    execute: async ({ message, workingDir }) => {
      logger.info("Git commit tool executing", { sessionId, message, workingDir });

      const { stdout, stderr, exitCode } = await docker.execCommand(
        sessionId,
        ['/bin/sh', '-c', `git commit -m "${message}"`],
        workingDir
      );

      if (exitCode !== 0) {
        throw new Error(`Git commit failed: ${stderr}`);
      }

      return `Successfully created commit: ${message}`;
    },
  });

  const gitPushTool = tool({
    description: "Push commits to the remote repository",
    inputSchema: z.object({
      remote: z.string().optional().describe("Remote name (default: origin)"),
      branch: z.string().optional().describe("Branch name (default: current branch)"),
      workingDir: z.string().describe("The git repository directory"),
    }),
    execute: async ({ remote = "origin", branch, workingDir }) => {
      logger.info("Git push tool executing", { sessionId, remote, branch, workingDir });

      const pushCommand = branch ? `git push ${remote} ${branch}` : `git push`;
      const { stdout, stderr, exitCode } = await docker.execCommand(
        sessionId,
        ['/bin/sh', '-c', pushCommand],
        workingDir
      );

      if (exitCode !== 0) {
        throw new Error(`Git push failed: ${stderr}`);
      }

      return `Successfully pushed to ${remote}${branch ? `/${branch}` : ''}`;
    },
  });

  const githubCreatePRTool = tool({
    description: "Create a GitHub Pull Request using gh CLI",
    inputSchema: z.object({
      title: z.string().describe("Pull request title"),
      body: z.string().describe("Pull request description"),
      base: z.string().optional().describe("Base branch (default: main)"),
      workingDir: z.string().describe("The git repository directory"),
    }),
    execute: async ({ title, body, base = "main", workingDir }) => {
      logger.info("GitHub create PR tool executing", { sessionId, title, base, workingDir });

      const { stdout, stderr, exitCode } = await docker.execCommand(
        sessionId,
        ['/bin/sh', '-c', `gh pr create --title "${title}" --body "${body}" --base ${base}`],
        workingDir
      );

      if (exitCode !== 0) {
        throw new Error(`GitHub PR creation failed: ${stderr}`);
      }

      return stdout || `Successfully created pull request: ${title}`;
    },
  });

  return {
    bash: bashTool,
    textEditorTool,
    fileUpdateTool,
    gitCloneTool,
    gitAddTool,
    gitCommitTool,
    gitPushTool,
    githubCreatePRTool,
  };
}

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
    if (call.toolName === "gitCloneTool") {
      return "Cloning repository...";
    } else if (call.toolName === "gitAddTool") {
      return "Staging changes...";
    } else if (call.toolName === "gitCommitTool") {
      return "Committing changes...";
    } else if (call.toolName === "gitPushTool") {
      return "Pushing to remote...";
    } else if (call.toolName === "githubCreatePRTool") {
      return "Creating pull request...";
    } else if (call.toolName === "bash") {
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

const EXPERIMENT_CODE_UPDATE_AGENT_PROMPT = `You are an AI agent that automates adding PostHog feature flag code to GitHub repositories for A\\/B testing.

## Your Workflow (MUST COMPLETE ALL STEPS IN ORDER)

**CRITICAL**: You MUST complete ALL steps below. Steps 7-9 are MANDATORY and cannot be skipped.

**NOTE**: All file operations happen inside an isolated Docker container at /workspace. The container is automatically created and destroyed for each session.

1. **Clone Repository**: Use **gitCloneTool** to clone the GitHub repository into /workspace
   - The repository will be cloned directly into the workspace directory
   - All subsequent commands should use the cloned repository path

2. **Analyze Codebase**: Analyze the codebase (README, package.json, etc.) to detect language, framework, and dependencies

3. **Install Dependencies**: Check if dependencies are installed; if not, install using the correct package manager:
   - Check for pnpm-lock.yaml → use pnpm
   - Check for package-lock.json → use npm
   - Run install command if node_modules is missing

4. **Locate Target Files**: Locate target files based on the hypothesis

5. **Install PostHog SDK**: Install appropriate PostHog SDK if needed (using the detected package manager)

6. **Apply Feature Flag Code**: Generate and apply feature flag code

7. **MANDATORY - Commit Changes**: Use **gitAddTool** and **gitCommitTool** to commit changes
   - Use gitAddTool to stage files (e.g., files: ".")
   - Use gitCommitTool with a descriptive message (e.g., "Add PostHog feature flag for [hypothesis]")
   - Provide the repository's working directory path to both tools

8. **MANDATORY - Push Changes**: Use **gitPushTool** to push commits to remote
   - Provide the repository's working directory path
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

- JavaScript/TypeScript (client): posthog-js
- Node.js/Next.js (server): posthog-node
- Python: posthog
- React: posthog-js (with React hooks)

## Using Text Variants

When a test variant text is provided:
- Locate the original text/copy in the target file
- Wrap it in a feature flag conditional
- For the 'test' variant: render the provided test variant text
- For the 'control' variant: keep the original text
- Preserve all surrounding code structure and styling

## Available Tools

### File & Command Execution Tools
- **bash**: Execute bash commands (ls, grep, cat, find, git, mkdir, cd, npm, pnpm, gh only) - runs inside Docker container
- **textEditorTool**: View, create, and edit files in the container
- **fileUpdateTool**: Apply intelligent code merges using MorphLLM

### Git & GitHub Tools (PREFERRED for git operations)
- **gitCloneTool**: Clone a GitHub repository (use this instead of bash for cloning)
- **gitAddTool**: Stage files for commit using git add
- **gitCommitTool**: Create a commit with staged changes
- **gitPushTool**: Push commits to remote repository
- **githubCreatePRTool**: Create a GitHub Pull Request using gh CLI

**IMPORTANT**: Use the dedicated git tools (gitCloneTool, gitAddTool, gitCommitTool, gitPushTool) instead of running git commands through bash. They provide better error handling and logging.

## Critical Requirements

- Read README/package.json first to identify language and framework
- Detect package manager by checking for lock files (pnpm-lock.yaml → pnpm, package-lock.json → npm)
- Install dependencies if node_modules is missing (using detected package manager)
- Check if PostHog is already initialized to avoid duplicates
- Use language-appropriate feature flag patterns
- Keep code changes minimal and focused
- Include clear comments explaining the A\\/B test logic
- MUST commit changes with descriptive message
- MUST NOT run git config user.name or git config user.email commands; use the repository's existing configuration
- MUST push changes to remote repository
- MUST push verified

## Success Criteria - YOU MUST COMPLETE ALL OF THESE

Your task is NOT complete until ALL of the following are true:

✓ Changes Committed: You have committed changes using **gitAddTool** and **gitCommitTool**
✓ Changes Pushed: You have pushed changes to remote using **gitPushTool**
✓ Push Verified: You have confirmed the push succeeded

## Final Report - REQUIRED

At the end of your execution, you MUST provide a summary that includes:

✓ Commit Status: Confirm that changes were committed (include commit message)
✓ Push Status: Confirm that changes were pushed to remote
✓ Files Modified: List the files that were changed
✓ Repository Path: The working directory path used in the container
`;

export const experimentCodeUpdateTool = tool({
  description: "Automates adding PostHog feature flag code to a GitHub repository for A\\/B testing. Clones the repo, analyzes the codebase, installs dependencies if needed, adds feature flag implementation, and commits changes.",
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
    // Generate unique execution ID (also used as session ID for Docker)
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
    progressStore.update(executionId, "Creating Docker container...");

    // Create Docker container for this session
    try {
      await docker.createContainer(executionId);
      logger.info("Docker container created", { executionId });
      progressStore.update(executionId, "Starting experiment code update...");
    } catch (error) {
      logger.error("Failed to create Docker container", { executionId, error });
      progressStore.complete(executionId, false);
      throw new Error(`Failed to create Docker container: ${error}`);
    }

    try {
      logger.info("Starting sub-agent with streamText", { executionId });

      // Create Docker-based tools for this session
      const tools = createDockerTools(executionId);

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
          bash: tools.bash,
          fileUpdateTool: tools.fileUpdateTool,
          textEditorTool: tools.textEditorTool,
          gitCloneTool: tools.gitCloneTool,
          gitAddTool: tools.gitAddTool,
          gitCommitTool: tools.gitCommitTool,
          gitPushTool: tools.gitPushTool,
          githubCreatePRTool: tools.githubCreatePRTool,
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
    } finally {
      // Clean up Docker container
      try {
        logger.info("Cleaning up Docker container", { executionId });
        await docker.destroyContainer(executionId);
      } catch (cleanupError) {
        logger.error("Failed to cleanup Docker container", { executionId, error: cleanupError });
        // Don't throw - we don't want cleanup errors to mask the actual error
      }
    }
  },
});
