import { tool } from 'ai';
import { z } from 'zod';
import { createContainer, execCommand } from '@/lib/docker';
import { sessionStore } from '@/lib/session-store';
import { detectBuildConfig } from '@/lib/build-detector';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

export const repoSetupTool = tool({
  description: `Set up a GitHub repository for development. This tool:
- Creates a persistent Docker container
- Clones the specified GitHub repository
- Auto-detects the framework and build configuration
- Installs dependencies
- Builds the project (if needed)
- Starts the development server
- Returns session information for preview and file browsing

This should be the FIRST tool called when a user provides a GitHub repository URL.`,
  inputSchema: z.object({
    repoUrl: z.string().describe('The GitHub repository URL to clone (e.g., https://github.com/user/repo or user/repo)'),
  }),
  execute: async ({ repoUrl }) => {
    const sessionId = randomUUID();

    try {
      logger.info('Starting repo setup', { sessionId, repoUrl });

      // Parse repo name from URL
      const repoMatch = repoUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
      const repoSlug = repoMatch ? repoMatch[1] : repoUrl;
      const repoName = repoSlug.split('/')[1] || 'unknown';

      // Find available host port (start from 3001 to avoid Pilot app on 3000)
      const allSessions = sessionStore.getAllSessions();
      const usedPorts = allSessions
        .map(s => s.previewPort)
        .filter((p): p is number => p !== undefined);
      let hostPort = 3001;
      while (usedPorts.includes(hostPort)) {
        hostPort++;
      }

      logger.info('Allocated host port', { hostPort });

      // Create container with port mapping (container port 3000 -> host port)
      const container = await createContainer(sessionId, {
        portMappings: { 3000: hostPort },
      });

      // Create session entry
      sessionStore.createSession(sessionId, container.id);
      sessionStore.updateSession(sessionId, {
        repoUrl,
        repoName,
        buildStatus: 'cloning',
        previewPort: hostPort,
      });

      // Clone repository
      logger.info('Cloning repository', { repoUrl, sessionId });
      const cloneResult = await execCommand(
        sessionId,
        ['gh', 'repo', 'clone', repoSlug, '/workspace/repo', '--', '--depth=1'],
        '/workspace'
      );

      if (cloneResult.exitCode !== 0) {
        sessionStore.updateSession(sessionId, { buildStatus: 'failed' });
        throw new Error(`Failed to clone repository: ${cloneResult.stderr}`);
      }

      logger.info('Repository cloned successfully', { sessionId });

      // Change working directory to repo
      const workDir = '/workspace/repo';

      // Detect build configuration
      sessionStore.updateSession(sessionId, { buildStatus: 'building' });

      // First, we need to update the working directory for detection
      // Copy package.json temporarily for detection
      await execCommand(sessionId, ['cp', '/workspace/repo/package.json', '/workspace/package.json']);

      const buildConfig = await detectBuildConfig(sessionId);

      sessionStore.updateSession(sessionId, {
        framework: buildConfig.framework,
      });

      logger.info('Build configuration detected', { buildConfig });

      // Install dependencies
      logger.info('Installing dependencies', { sessionId });
      const installResult = await execCommand(
        sessionId,
        buildConfig.installCommand.split(' '),
        workDir
      );

      if (installResult.exitCode !== 0) {
        logger.warn('Dependency installation had warnings', { stderr: installResult.stderr });
      }

      // Build if needed
      if (buildConfig.buildCommand) {
        logger.info('Building project', { sessionId });
        const buildResult = await execCommand(
          sessionId,
          buildConfig.buildCommand.split(' '),
          workDir
        );

        if (buildResult.exitCode !== 0) {
          logger.warn('Build had warnings', { stderr: buildResult.stderr });
        }
      }

      // Start dev server in background
      logger.info('Starting dev server', { sessionId, devCommand: buildConfig.devCommand });

      // Start the dev server with nohup to keep it running in background
      const devCommand = `cd ${workDir} && nohup ${buildConfig.devCommand} > /tmp/dev-server.log 2>&1 &`;
      await execCommand(sessionId, ['sh', '-c', devCommand]);

      // Wait a few seconds for server to start
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Update session status
      sessionStore.updateSession(sessionId, {
        buildStatus: 'running',
        previewReady: true,
      });

      logger.info('Repo setup completed successfully', {
        sessionId,
        repoName,
        framework: buildConfig.framework,
        previewPort: hostPort,
      });

      return {
        success: true,
        sessionId,
        repoName,
        framework: buildConfig.framework,
        previewPort: hostPort,
        previewUrl: `http://localhost:${hostPort}`,
        previewReady: true,
        message: `Successfully set up ${repoName}. The dev server is running on port ${hostPort}. You can now browse files and preview the application.`,
      };
    } catch (error) {
      logger.error('Repo setup failed', { sessionId, error });

      // Update session status to failed
      sessionStore.updateSession(sessionId, { buildStatus: 'failed' });

      return {
        success: false,
        sessionId,
        error: String(error),
        message: `Failed to set up repository: ${error}`,
      };
    }
  },
});
