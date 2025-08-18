import { readFileSync } from "fs";
import { join } from "path";

export function loadPrompt(promptName: string): string {
  const promptPath = join(process.cwd(), "src", "prompts", `${promptName}.md`);
  return readFileSync(promptPath, "utf-8");
}
