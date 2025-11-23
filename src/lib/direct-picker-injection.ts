/**
 * Direct Picker Script Injection
 *
 * Injects the React component picker script directly into the cloned repository
 * by modifying framework entry point files.
 */

import { execCommand, readFile, writeFile } from './docker';
import { logger } from './logger';
import * as path from 'path';
import * as fs from 'fs';

interface InjectionResult {
  success: boolean;
  filesModified: string[];
  error?: string;
}

export class DirectPickerInjection {
  private static readonly PICKER_MARKER = '__pilot_picker_injected__';
  private static readonly REPO_PATH = '/workspace/repo';

  /**
   * Inject picker script directly into cloned repository
   */
  static async injectPicker(
    sessionId: string,
    framework: string
  ): Promise<InjectionResult> {
    try {
      logger.info('[DirectInjection] Starting picker injection', { sessionId, framework });

      // Step 1: Copy picker script to repo's public folder
      await this.copyPickerScript(sessionId);

      // Step 2: Modify entry point based on framework
      const modifiedFiles = await this.modifyEntryPoint(sessionId, framework);

      // Step 3: Track modifications for cleanup
      await this.trackModifications(sessionId, modifiedFiles);

      logger.info('[DirectInjection] Picker injection successful', {
        sessionId,
        filesModified: modifiedFiles
      });

      return {
        success: true,
        filesModified: modifiedFiles
      };
    } catch (error) {
      logger.error('[DirectInjection] Failed to inject picker', {
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        filesModified: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Copy picker script to repository's public folder
   */
  private static async copyPickerScript(sessionId: string): Promise<void> {
    try {
      // Read picker script from Pilot's public folder
      const pickerPath = path.join(process.cwd(), 'public', 'picker', 'react-component-picker.js');
      const pickerContent = fs.readFileSync(pickerPath, 'utf-8');

      // Ensure public/picker directory exists in container
      await execCommand(sessionId, ['mkdir', '-p', `${this.REPO_PATH}/public/picker`]);

      // Write picker script to container
      await writeFile(sessionId, `${this.REPO_PATH}/public/picker/react-component-picker.js`, pickerContent);

      logger.info('[DirectInjection] Picker script copied to repository', { sessionId });
    } catch (error) {
      logger.error('[DirectInjection] Failed to copy picker script', { sessionId, error });
      throw new Error(`Failed to copy picker script: ${error}`);
    }
  }

  /**
   * Modify framework entry point to load picker
   */
  private static async modifyEntryPoint(
    sessionId: string,
    framework: string
  ): Promise<string[]> {
    const modifiedFiles: string[] = [];

    try {
      // Detect specific framework variant
      if (framework === 'Next.js') {
        const nextFiles = await this.injectNextJs(sessionId);
        modifiedFiles.push(...nextFiles);
      } else if (framework === 'Vite' || framework === 'Create React App') {
        const htmlFiles = await this.injectHtmlTemplate(sessionId);
        modifiedFiles.push(...htmlFiles);
      } else {
        // Default fallback: try HTML injection
        logger.warn('[DirectInjection] Unknown framework, attempting HTML injection', {
          sessionId,
          framework
        });
        const defaultFiles = await this.injectHtmlTemplate(sessionId);
        modifiedFiles.push(...defaultFiles);
      }

      return modifiedFiles;
    } catch (error) {
      logger.error('[DirectInjection] Failed to modify entry point', { sessionId, error });
      throw error;
    }
  }

  /**
   * Inject into Next.js project (both App and Pages router)
   */
  private static async injectNextJs(sessionId: string): Promise<string[]> {
    const modifiedFiles: string[] = [];

    // Try App Router first (app/layout.tsx)
    const appLayoutPaths = [
      `${this.REPO_PATH}/app/layout.tsx`,
      `${this.REPO_PATH}/app/layout.jsx`,
      `${this.REPO_PATH}/src/app/layout.tsx`,
      `${this.REPO_PATH}/src/app/layout.jsx`,
    ];

    for (const layoutPath of appLayoutPaths) {
      try {
        const content = await readFile(sessionId, layoutPath);

        // Check if already injected
        if (content.includes(this.PICKER_MARKER)) {
          logger.info('[DirectInjection] Picker already injected in layout', { layoutPath });
          return modifiedFiles;
        }

        // Backup original file
        await writeFile(sessionId, `${layoutPath}.pilot-backup`, content);

        // Inject script tag
        const scriptTag = `        {/* ${this.PICKER_MARKER} - Auto-injected by Pilot */}\n        <script src="/picker/react-component-picker.js" defer />`;

        let modifiedContent: string;

        // Check if there's already a <head> tag
        if (content.includes('<head>')) {
          // Inject after <head> tag
          modifiedContent = content.replace(
            /<head>/i,
            `<head>\n${scriptTag}`
          );
        } else if (content.includes('<html')) {
          // No head tag - create one after <html>
          modifiedContent = content.replace(
            /<html([^>]*)>/i,
            `<html$1>\n      <head>\n${scriptTag}\n      </head>`
          );
        } else {
          throw new Error('Could not find suitable injection point in layout file');
        }

        await writeFile(sessionId, layoutPath, modifiedContent);
        modifiedFiles.push(layoutPath);

        logger.info('[DirectInjection] Injected into Next.js App Router', {
          sessionId,
          file: layoutPath
        });

        return modifiedFiles;
      } catch (error) {
        // File doesn't exist or can't be read, try next path
        continue;
      }
    }

    // Try Pages Router (_document.tsx)
    const documentPaths = [
      `${this.REPO_PATH}/pages/_document.tsx`,
      `${this.REPO_PATH}/pages/_document.jsx`,
      `${this.REPO_PATH}/src/pages/_document.tsx`,
      `${this.REPO_PATH}/src/pages/_document.jsx`,
    ];

    for (const docPath of documentPaths) {
      try {
        const content = await readFile(sessionId, docPath);

        if (content.includes(this.PICKER_MARKER)) {
          logger.info('[DirectInjection] Picker already injected in document', { docPath });
          return modifiedFiles;
        }

        // Backup original file
        await writeFile(sessionId, `${docPath}.pilot-backup`, content);

        const scriptTag = `          {/* ${this.PICKER_MARKER} */}\n          <script src="/picker/react-component-picker.js" defer />`;

        // Inject after <Head> component
        const modifiedContent = content.replace(
          /<Head>/i,
          `<Head>\n${scriptTag}`
        );

        await writeFile(sessionId, docPath, modifiedContent);
        modifiedFiles.push(docPath);

        logger.info('[DirectInjection] Injected into Next.js Pages Router', {
          sessionId,
          file: docPath
        });

        return modifiedFiles;
      } catch (error) {
        continue;
      }
    }

    // Fallback: try public/index.html
    logger.warn('[DirectInjection] No Next.js entry point found, trying HTML fallback', { sessionId });
    return await this.injectHtmlTemplate(sessionId);
  }

  /**
   * Inject into HTML template (CRA, Vite, etc.)
   */
  private static async injectHtmlTemplate(sessionId: string): Promise<string[]> {
    const modifiedFiles: string[] = [];

    const htmlPaths = [
      `${this.REPO_PATH}/public/index.html`,
      `${this.REPO_PATH}/index.html`,
      `${this.REPO_PATH}/src/index.html`,
    ];

    for (const htmlPath of htmlPaths) {
      try {
        const content = await readFile(sessionId, htmlPath);

        if (content.includes(this.PICKER_MARKER)) {
          logger.info('[DirectInjection] Picker already injected in HTML', { htmlPath });
          return modifiedFiles;
        }

        // Backup original file
        await writeFile(sessionId, `${htmlPath}.pilot-backup`, content);

        const scriptTag = `    <!-- ${this.PICKER_MARKER} -->\n    <script src="/picker/react-component-picker.js" defer></script>`;

        let modifiedContent: string;

        if (content.includes('</head>')) {
          // Inject before </head>
          modifiedContent = content.replace(
            /<\/head>/i,
            `${scriptTag}\n  </head>`
          );
        } else if (content.includes('<body>')) {
          // No </head> tag, inject after <body>
          modifiedContent = content.replace(
            /<body>/i,
            `<body>\n${scriptTag}`
          );
        } else {
          // Last resort: append to HTML
          modifiedContent = content + '\n' + scriptTag;
        }

        await writeFile(sessionId, htmlPath, modifiedContent);
        modifiedFiles.push(htmlPath);

        logger.info('[DirectInjection] Injected into HTML template', {
          sessionId,
          file: htmlPath
        });

        return modifiedFiles;
      } catch (error) {
        continue;
      }
    }

    throw new Error('Could not find HTML entry point to inject picker');
  }

  /**
   * Track modified files for cleanup
   */
  private static async trackModifications(
    sessionId: string,
    files: string[]
  ): Promise<void> {
    try {
      const trackingData = {
        modifiedAt: new Date().toISOString(),
        files,
        sessionId
      };

      await writeFile(
        sessionId,
        '/workspace/.pilot-modifications.json',
        JSON.stringify(trackingData, null, 2)
      );

      logger.info('[DirectInjection] Modifications tracked', {
        sessionId,
        fileCount: files.length
      });
    } catch (error) {
      logger.error('[DirectInjection] Failed to track modifications', { sessionId, error });
      // Non-critical - don't throw
    }
  }

  /**
   * Clean up injected scripts (call when session ends)
   */
  static async cleanupInjection(sessionId: string): Promise<void> {
    try {
      logger.info('[DirectInjection] Starting cleanup', { sessionId });

      // Try to read tracking file
      let tracking: { files: string[] } | null = null;
      try {
        const trackingContent = await readFile(sessionId, '/workspace/.pilot-modifications.json');
        tracking = JSON.parse(trackingContent);
      } catch (error) {
        logger.warn('[DirectInjection] No tracking file found, skipping file restoration', { sessionId });
      }

      // Restore original files from backups
      if (tracking && tracking.files) {
        for (const file of tracking.files) {
          try {
            const backupPath = `${file}.pilot-backup`;
            // Check if backup exists
            const checkResult = await execCommand(sessionId, ['test', '-f', backupPath]);
            if (checkResult.exitCode === 0) {
              // Restore from backup
              await execCommand(sessionId, ['mv', backupPath, file]);
              logger.info('[DirectInjection] Restored file from backup', { sessionId, file });
            }
          } catch (error) {
            logger.warn('[DirectInjection] Could not restore file', { sessionId, file, error });
          }
        }
      }

      // Remove picker script directory
      await execCommand(sessionId, ['rm', '-rf', `${this.REPO_PATH}/public/picker`]).catch(() => {
        logger.warn('[DirectInjection] Could not remove picker directory', { sessionId });
      });

      // Remove tracking file
      await execCommand(sessionId, ['rm', '-f', '/workspace/.pilot-modifications.json']).catch(() => {
        logger.warn('[DirectInjection] Could not remove tracking file', { sessionId });
      });

      logger.info('[DirectInjection] Cleanup completed', { sessionId });
    } catch (error) {
      logger.error('[DirectInjection] Cleanup failed', { sessionId, error });
      // Don't throw - best effort cleanup
    }
  }
}
