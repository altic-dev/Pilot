import Docker from 'dockerode';
import { logger } from './logger';
import * as tar from 'tar-stream';

const docker = new Docker();
const containerCache = new Map<string, Docker.Container>();

/**
 * Ensure the Docker image exists, build if necessary
 */
async function ensureImageExists(): Promise<void> {
  try {
    const images = await docker.listImages({
      filters: { reference: ['pilot-agent:latest'] },
    });

    if (images.length === 0) {
      logger.info('Building pilot-agent Docker image');

      const stream = await docker.buildImage({
        context: process.cwd(),
        src: ['Dockerfile.agent'],
      }, {
        t: 'pilot-agent:latest',
        dockerfile: 'Dockerfile.agent',
      });

      await new Promise((resolve, reject) => {
        docker.modem.followProgress(stream, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        }, (event) => {
          if (event.stream) {
            logger.info('Docker build', { message: event.stream.trim() });
          }
        });
      });

      logger.info('Docker image built successfully');
    }
  } catch (error) {
    logger.error('Failed to ensure Docker image exists', { error });
    throw new Error(`Failed to build Docker image: ${error}`);
  }
}

/**
 * Create a new container for a chat session
 */
export async function createContainer(sessionId: string): Promise<Docker.Container> {
  try {
    logger.info('Creating Docker container', { sessionId });

    await ensureImageExists();

    const container = await docker.createContainer({
      Image: 'pilot-agent:latest',
      name: `pilot-session-${sessionId}`,
      Env: [
        `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,
      ],
      WorkingDir: '/workspace',
      HostConfig: {
        AutoRemove: false,
        Memory: 2 * 1024 * 1024 * 1024, // 2GB memory limit
        MemorySwap: 2 * 1024 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 200000, // 2 CPU cores max
        NetworkMode: 'bridge',
      },
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    await container.start();
    containerCache.set(sessionId, container);

    logger.info('Container created and started', { sessionId, containerId: container.id });
    return container;
  } catch (error) {
    logger.error('Failed to create container', { sessionId, error });
    throw new Error(`Failed to create Docker container: ${error}`);
  }
}

/**
 * Get existing container for a session
 */
export function getContainer(sessionId: string): Docker.Container | undefined {
  return containerCache.get(sessionId);
}

/**
 * Execute a command in the container
 */
export async function execCommand(
  sessionId: string,
  command: string[],
  workingDir?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const container = containerCache.get(sessionId);
  if (!container) {
    throw new Error(`No container found for session: ${sessionId}`);
  }

  try {
    logger.info('Executing command in container', { sessionId, command, workingDir });

    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: workingDir || '/workspace',
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    let stdout = '';
    let stderr = '';

    await new Promise<void>((resolve, reject) => {
      container.modem.demuxStream(stream,
        {
          write: (chunk: Buffer) => { stdout += chunk.toString(); },
        } as NodeJS.WritableStream,
        {
          write: (chunk: Buffer) => { stderr += chunk.toString(); },
        } as NodeJS.WritableStream
      );

      stream.on('end', () => resolve());
      stream.on('error', (err) => reject(err));
    });

    const inspection = await exec.inspect();
    const exitCode = inspection.ExitCode || 0;

    logger.info('Command executed', { sessionId, exitCode, stdoutLength: stdout.length, stderrLength: stderr.length });

    return { stdout, stderr, exitCode };
  } catch (error) {
    logger.error('Failed to execute command', { sessionId, command, error });
    throw new Error(`Failed to execute command: ${error}`);
  }
}

/**
 * Read a file from the container
 */
export async function readFile(sessionId: string, filePath: string): Promise<string> {
  const container = containerCache.get(sessionId);
  if (!container) {
    throw new Error(`No container found for session: ${sessionId}`);
  }

  try {
    const stream = await container.getArchive({ path: filePath });
    const extract = tar.extract();

    return new Promise<string>((resolve, reject) => {
      let content = '';

      extract.on('entry', (header, entryStream, next) => {
        const chunks: Buffer[] = [];

        entryStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        entryStream.on('end', () => {
          content = Buffer.concat(chunks).toString('utf-8');
          next();
        });

        entryStream.resume();
      });

      extract.on('finish', () => {
        resolve(content);
      });

      extract.on('error', (err) => {
        reject(err);
      });

      stream.pipe(extract);
    });
  } catch (error) {
    logger.error('Failed to read file from container', { sessionId, filePath, error });
    throw new Error(`Failed to read file: ${error}`);
  }
}

/**
 * Write a file to the container
 */
export async function writeFile(sessionId: string, filePath: string, content: string): Promise<void> {
  const container = containerCache.get(sessionId);
  if (!container) {
    throw new Error(`No container found for session: ${sessionId}`);
  }

  try {
    const pack = tar.pack();
    const fileName = filePath.split('/').pop() || 'file';
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/')) || '/workspace';

    pack.entry({ name: fileName }, content);
    pack.finalize();

    await container.putArchive(pack, { path: dirPath });
    logger.info('File written to container', { sessionId, filePath });
  } catch (error) {
    logger.error('Failed to write file to container', { sessionId, filePath, error });
    throw new Error(`Failed to write file: ${error}`);
  }
}

/**
 * Destroy container and clean up resources
 */
export async function destroyContainer(sessionId: string): Promise<void> {
  const container = containerCache.get(sessionId);
  if (!container) {
    logger.warn('No container to destroy', { sessionId });
    return;
  }

  try {
    logger.info('Destroying container', { sessionId });

    await container.stop({ t: 10 });
    await container.remove({ force: true });

    containerCache.delete(sessionId);
    logger.info('Container destroyed', { sessionId });
  } catch (error) {
    logger.error('Failed to destroy container', { sessionId, error });
    // Don't throw - best effort cleanup
  }
}

/**
 * Clean up all orphaned containers
 */
export async function cleanupOrphanedContainers(): Promise<void> {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { name: ['pilot-session-'] },
    });

    logger.info('Cleaning up orphaned containers', { count: containers.length });

    for (const containerInfo of containers) {
      try {
        const container = docker.getContainer(containerInfo.Id);
        await container.stop({ t: 5 });
        await container.remove({ force: true });
        logger.info('Orphaned container removed', { containerId: containerInfo.Id });
      } catch (error) {
        logger.error('Failed to remove orphaned container', { containerId: containerInfo.Id, error });
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup orphaned containers', { error });
  }
}
