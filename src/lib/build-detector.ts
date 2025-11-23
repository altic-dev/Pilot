import { readFile } from './docker';
import { logger } from './logger';

export interface BuildConfig {
  framework: string;
  packageManager: 'npm' | 'pnpm' | 'yarn';
  installCommand: string;
  buildCommand?: string;
  devCommand: string;
  defaultPort: number;
}

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Detect framework from dependencies
 */
function detectFramework(packageJson: PackageJson): string {
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  if (allDeps.next) return 'Next.js';
  if (allDeps.vite) return 'Vite';
  if (allDeps.remix || allDeps['@remix-run/react']) return 'Remix';
  if (allDeps['react-scripts']) return 'Create React App';
  if (allDeps.nuxt) return 'Nuxt';
  if (allDeps.gatsby) return 'Gatsby';
  if (allDeps['@angular/core']) return 'Angular';
  if (allDeps.vue) return 'Vue';
  if (allDeps.svelte) return 'Svelte';

  return 'Unknown';
}

/**
 * Detect package manager from lock files
 */
async function detectPackageManager(sessionId: string): Promise<'npm' | 'pnpm' | 'yarn'> {
  try {
    // Check for lock files
    const { execCommand } = await import('./docker');

    const pnpmCheck = await execCommand(sessionId, ['test', '-f', '/workspace/pnpm-lock.yaml']);
    if (pnpmCheck.exitCode === 0) return 'pnpm';

    const yarnCheck = await execCommand(sessionId, ['test', '-f', '/workspace/yarn.lock']);
    if (yarnCheck.exitCode === 0) return 'yarn';

    // Default to npm
    return 'npm';
  } catch {
    return 'npm';
  }
}

/**
 * Detect default port based on framework
 */
function detectDefaultPort(framework: string, scripts?: Record<string, string>): number {
  // Check scripts for explicit port
  if (scripts) {
    const devScript = scripts.dev || scripts.start || '';
    const portMatch = devScript.match(/--port[=\s]+(\d+)/);
    if (portMatch) {
      return parseInt(portMatch[1], 10);
    }
  }

  // Framework defaults
  switch (framework) {
    case 'Next.js':
      return 3000;
    case 'Vite':
      return 5173;
    case 'Create React App':
      return 3000;
    case 'Remix':
      return 3000;
    case 'Angular':
      return 4200;
    case 'Vue':
      return 8080;
    default:
      return 3000;
  }
}

/**
 * Detect dev server command
 */
function detectDevCommand(framework: string, scripts?: Record<string, string>): string {
  if (!scripts) {
    return 'npm run dev';
  }

  // Priority order for dev scripts
  const devScriptNames = ['dev', 'start', 'serve', 'preview'];

  for (const scriptName of devScriptNames) {
    if (scripts[scriptName]) {
      return scriptName;
    }
  }

  // Fallback based on framework
  switch (framework) {
    case 'Next.js':
    case 'Vite':
    case 'Remix':
      return 'dev';
    case 'Create React App':
    case 'Vue':
    case 'Angular':
      return 'start';
    default:
      return 'dev';
  }
}

/**
 * Detect build command
 */
function detectBuildCommand(scripts?: Record<string, string>): string | undefined {
  if (!scripts) {
    return undefined;
  }

  if (scripts.build) {
    return 'build';
  }

  return undefined;
}

/**
 * Auto-detect build configuration from package.json
 */
export async function detectBuildConfig(sessionId: string): Promise<BuildConfig> {
  try {
    logger.info('Detecting build configuration', { sessionId });

    // Read package.json
    const packageJsonContent = await readFile(sessionId, '/workspace/package.json');
    const packageJson: PackageJson = JSON.parse(packageJsonContent);

    // Detect framework
    const framework = detectFramework(packageJson);
    logger.info('Framework detected', { framework });

    // Detect package manager
    const packageManager = await detectPackageManager(sessionId);
    logger.info('Package manager detected', { packageManager });

    // Detect commands
    const devScriptName = detectDevCommand(framework, packageJson.scripts);
    const buildScriptName = detectBuildCommand(packageJson.scripts);
    const defaultPort = detectDefaultPort(framework, packageJson.scripts);

    const buildConfig: BuildConfig = {
      framework,
      packageManager,
      installCommand: packageManager === 'npm' ? 'npm install'
        : packageManager === 'pnpm' ? 'pnpm install'
        : 'yarn install',
      buildCommand: buildScriptName
        ? `${packageManager} run ${buildScriptName}`
        : undefined,
      devCommand: `${packageManager} run ${devScriptName}`,
      defaultPort,
    };

    logger.info('Build configuration detected', buildConfig);
    return buildConfig;
  } catch (error) {
    logger.error('Failed to detect build configuration', { sessionId, error });

    // Return sensible defaults
    return {
      framework: 'Unknown',
      packageManager: 'npm',
      installCommand: 'npm install',
      devCommand: 'npm run dev',
      defaultPort: 3000,
    };
  }
}
