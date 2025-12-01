import type { WarpGrepProvider } from "@morphllm/morphsdk";
import * as docker from "./docker";

export class DockerRipgrepProvider implements WarpGrepProvider {
  constructor(
    private sessionId: string,
    private workDir: string = "/workspace",
  ) {}

  async grep(params: { pattern: string; path: string }) {
    const args = [
      "/bin/sh",
      "-c",
      `rg --no-config --no-heading --with-filename --line-number --color=never --trim --max-columns=400 '${params.pattern}' '${params.path}' || true`,
    ];

    try {
      const { stdout, stderr, exitCode } = await docker.execCommand(
        this.sessionId,
        args,
        this.workDir,
      );

      // Exit code 0 = matches found, 1 = no matches (not an error), 2+ = error
      if (exitCode !== 0 && exitCode !== 1) {
        return {
          lines: [],
          error: `Ripgrep failed: ${stderr}`,
        };
      }

      const lines = (stdout || "")
        .trim()
        .split(/\r?\n/)
        .filter((l) => l.length > 0);

      return { lines };
    } catch (error) {
      return {
        lines: [],
        error: `Grep execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async read(params: { path: string; start?: number; end?: number }) {
    const start = params.start ?? 1;
    const end = params.end ?? 1000000;

    const args = [
      "/bin/sh",
      "-c",
      `sed -n '${start},${end}p' '${params.path}'`,
    ];

    try {
      const { stdout, stderr, exitCode } = await docker.execCommand(
        this.sessionId,
        args,
        this.workDir,
      );

      if (exitCode !== 0) {
        return {
          lines: [],
          error: `Failed to read file: ${stderr}`,
        };
      }

      const lines = stdout
        .split(/\r?\n/)
        .map((line, idx) => `${start + idx}|${line}`)
        .filter((l) => l.length > 0);

      return { lines };
    } catch (error) {
      return {
        lines: [],
        error: `Read execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async glob(params: {
    pattern: string;
    path: string;
  }): Promise<{ files: string[] }> {
    const args = [
      "/bin/sh",
      "-c",
      `rg --no-config --files -g '${params.pattern}' '${params.path}' || true`,
    ];

    try {
      const { stdout, exitCode } = await docker.execCommand(
        this.sessionId,
        args,
        this.workDir,
      );

      if (exitCode !== 0) {
        return { files: [] };
      }

      const files = (stdout || "")
        .trim()
        .split(/\r?\n/)
        .filter((l) => l.length > 0);

      return { files };
    } catch (error) {
      return { files: [] };
    }
  }

  async analyse(params: {
    path: string;
    pattern?: string | null;
    maxResults?: number;
    maxDepth?: number;
  }) {
    const pattern = params.pattern ?? "*";
    const maxResults = params.maxResults ?? 100;

    const result = await this.glob({ pattern, path: params.path });

    return result.files.slice(0, maxResults).map((f) => ({
      name: f.split("/").pop() || f,
      path: f,
      type: f.endsWith("/") ? ("dir" as const) : ("file" as const),
      depth: 0,
    }));
  }
}
