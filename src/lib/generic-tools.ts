import { tool } from "ai";
import { z } from "zod";

/**
 * Generic bash tool that works with any AI provider
 * Replicates the functionality of anthropic.tools.bash_20250124
 */
export function createGenericBashTool(
  executeCommand: (command: string) => Promise<string>,
) {
  return tool({
    description: `Execute bash commands to interact with the system. Use this to run shell commands, manage files, and interact with git.

Available commands:
- ls, cat, find: File operations
- git: Version control
- mkdir, cd: Directory operations
- npm, pnpm: Package management
- gh: GitHub CLI

IMPORTANT: Only specific commands are allowed for security. Commands that modify git config (user.name, user.email) are forbidden.`,
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
      restart: z
        .boolean()
        .optional()
        .describe(
          "Whether to restart the bash session (currently not supported)",
        ),
    }),
    execute: async ({ command }) => {
      return await executeCommand(command);
    },
  });
}

/**
 * Generic text editor tool that works with any AI provider
 * Replicates the functionality of anthropic.tools.textEditor_20250728
 */
export function createGenericTextEditorTool(
  readFile: (path: string) => Promise<string>,
  writeFile: (path: string, content: string) => Promise<void>,
) {
  return tool({
    description: `Edit files using text editor commands. Supports viewing, creating, and modifying files.

Commands:
- view: Read a file or a specific range of lines
- create: Create a new file with content
- str_replace: Replace a string in a file

Use view_range as [start_line, end_line] to read specific sections.`,
    inputSchema: z.object({
      command: z
        .enum(["view", "create", "str_replace"])
        .describe("The editor command to execute"),
      path: z.string().describe("Path to the file"),
      file_text: z.string().optional().describe("Content for create command"),
      old_str: z
        .string()
        .optional()
        .describe("String to find for str_replace command"),
      new_str: z
        .string()
        .optional()
        .describe("String to replace with for str_replace command"),
      insert_line: z
        .number()
        .optional()
        .describe("Line number for insert operation (not commonly used)"),
      view_range: z
        .tuple([z.number(), z.number()])
        .optional()
        .describe("Range of lines to view [start, end]"),
    }),
    execute: async ({
      command,
      path,
      file_text,
      old_str,
      new_str,
      view_range,
    }) => {
      if (command === "view") {
        const content = await readFile(path);
        const lines = content.split("\n");

        if (view_range) {
          const [start, end] = view_range;
          const selectedLines = lines.slice(start - 1, end);
          return selectedLines.join("\n");
        }

        return content;
      }

      if (command === "create") {
        await writeFile(path, file_text || "");
        return `Created ${path}`;
      }

      if (command === "str_replace") {
        if (!old_str) {
          throw new Error("old_str is required for str_replace command");
        }

        let content = await readFile(path);

        if (!content.includes(old_str)) {
          throw new Error(`old_str not found in ${path}`);
        }

        content = content.replace(old_str, new_str || "");
        await writeFile(path, content);
        return `Replaced content in ${path}`;
      }

      throw new Error(`Unknown command: ${command}`);
    },
  });
}
