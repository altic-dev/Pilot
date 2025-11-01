import { z } from "zod";
import { generateText, stepCountIs, tool } from "ai";
import { logger } from "@/lib/logger";
import { anthropic } from "@ai-sdk/anthropic";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import OpenAI from "openai";
import fileUpdateToolDescription from "./file-update-tool.md";
import experimentCodingAgentPrompt from "./experiment-code-update.md";

const execAsync = promisify(exec);
const morphClient = new OpenAI({
  apiKey: process.env.MORPH_LLM_API_KEY,
  baseURL: "https://api.morphllm.com/v1",
});

const bashTool = anthropic.tools.bash_20250124({
  execute: async ({ command, restart }) => {
    logger.info("Bash tool executing command", { command });

    const allowedCommands = ["ls", "grep", "cat", "find", "git", "mkdir", "cd"];
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

const textEditorTool = anthropic.tools.textEditor_20250728({
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
});

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

export const experimentCodeUpdateTool = tool({
  description: experimentCodingAgentPrompt,
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
  }),
  execute: async ({ githubUrl, featureFlagKey, hypothesis }): Promise<string> => {
    logger.info("Experiment code update tool invoked", {
      githubUrl,
      featureFlagKey,
      hypothesis: hypothesis.substring(0, 100),
    });

    try {
      logger.info("Starting sub-agent with generateText");

      const result = await generateText({
        model: anthropic("claude-sonnet-4-5"),
        prompt: `Your job is to perform the tasks:
    1. Clone the github repo using 'git clone ${githubUrl}'. Create a new folder called 'posthog-experiments' and clone the repo into it.
    2. Find the right file to make the code changes based on the hypothesis
    3. Generate just the code for adding the feature flag
    4. Update the file with the code changes
    5. Stage the changes using 'git add .'
    6. Commit the changes with a descriptive message using 'git commit -m "message"'
    7. Push the changes using 'git push'

    Here is the hypothesis: ${hypothesis}. The github url: ${githubUrl} and the posthog feature flag key: ${featureFlagKey}
    `,
        tools: {
          bash: bashTool,
          fileUpdateTool,
          textEditorTool,
        },
        stopWhen: stepCountIs(20),
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
