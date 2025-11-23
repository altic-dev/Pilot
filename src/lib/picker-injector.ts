/**
 * Picker Injector
 *
 * Utilities for injecting and managing the React component picker in preview iframes
 */

import { execCommand } from './docker';

export class PickerInjector {
  /**
   * Detect if React is available in the preview
   *
   * This checks if the app running in the container has React available
   * by looking for React-specific markers in the DOM.
   */
  static async detectReact(
    sessionId: string,
    previewPort: number = 3000
  ): Promise<{ hasReact: boolean; version?: string; mode?: string }> {
    try {
      // Create a script that checks for React in the running app
      const checkScript = `
        const http = require('http');

        const options = {
          hostname: 'localhost',
          port: ${previewPort},
          path: '/',
          method: 'GET',
          headers: { 'User-Agent': 'Pilot-Picker-Detector' }
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            // Check for React markers in HTML
            const hasReactRoot = data.includes('data-reactroot') ||
                                 data.includes('id="root"') ||
                                 data.includes('id="__next"');
            const hasReactScript = data.includes('react') || data.includes('React');

            console.log(JSON.stringify({
              hasReact: hasReactRoot || hasReactScript,
              confidence: hasReactRoot ? 'high' : (hasReactScript ? 'medium' : 'low')
            }));
          });
        });

        req.on('error', (error) => {
          console.log(JSON.stringify({ hasReact: false, error: error.message }));
        });

        req.setTimeout(5000, () => {
          req.destroy();
          console.log(JSON.stringify({ hasReact: false, error: 'timeout' }));
        });

        req.end();
      `;

      const result = await execCommand(sessionId, [
        'node',
        '-e',
        checkScript,
      ]);

      // Parse the JSON output
      const output = result.stdout.trim();
      const lines = output.split('\n');
      const lastLine = lines[lines.length - 1];

      try {
        const parsed = JSON.parse(lastLine);
        return {
          hasReact: parsed.hasReact === true,
          version: undefined, // We can't easily detect version from HTML
          mode: 'development', // Assume development mode
        };
      } catch (parseError) {
        // If we can't parse, assume React might not be available
        console.warn(
          '[PickerInjector] Failed to parse React detection result:',
          lastLine
        );
        return { hasReact: false };
      }
    } catch (error) {
      console.error('[PickerInjector] Error detecting React:', error);
      return { hasReact: false };
    }
  }

  /**
   * Get the injection script that should be added to the iframe
   *
   * This returns an HTML script tag that will load the picker when inserted
   * into the iframe document.
   */
  static getInjectionScript(baseUrl: string = ''): string {
    return `
      <script id="__pilot-picker-injector">
        (function() {
          if (window.__pilotPickerInjected) {
            console.log('[Pilot] Picker already injected');
            return;
          }

          window.__pilotPickerInjected = true;

          const script = document.createElement('script');
          script.src = '${baseUrl}/picker/react-component-picker.js';
          script.id = '__pilot-picker-script';

          script.onload = function() {
            console.log('[Pilot] React component picker loaded successfully');
          };

          script.onerror = function(error) {
            console.error('[Pilot] Failed to load picker script:', error);
            window.parent.postMessage({
              type: 'picker-load-error',
              error: 'Failed to load picker script'
            }, '*');
          };

          document.head.appendChild(script);
        })();
      </script>
    `;
  }

  /**
   * Get the inline script content for direct injection
   *
   * This can be used to inject the picker script directly without
   * needing to load it from a separate file.
   */
  static async getInlinePickerScript(): Promise<string> {
    try {
      const fs = require('fs');
      const path = require('path');
      const pickerPath = path.join(
        process.cwd(),
        'public',
        'picker',
        'react-component-picker.js'
      );
      return fs.readFileSync(pickerPath, 'utf-8');
    } catch (error) {
      console.error('[PickerInjector] Error reading picker script:', error);
      return '';
    }
  }

  /**
   * Validate if picker is supported for the given session
   *
   * This checks various conditions to determine if the picker
   * can be used with the current preview.
   */
  static async isPickerSupported(
    sessionId: string,
    previewPort: number
  ): Promise<{
    supported: boolean;
    reason?: string;
    details?: any;
  }> {
    try {
      // Check if React is detected
      const reactInfo = await this.detectReact(sessionId, previewPort);

      if (!reactInfo.hasReact) {
        return {
          supported: false,
          reason:
            'React not detected. Component picker requires a React application.',
          details: reactInfo,
        };
      }

      // Additional checks can be added here (e.g., React version, dev mode)

      return {
        supported: true,
        details: reactInfo,
      };
    } catch (error) {
      return {
        supported: false,
        reason: 'Error checking picker support',
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  /**
   * Create a postMessage bridge configuration
   *
   * Returns configuration for setting up secure postMessage communication
   */
  static getPostMessageConfig(allowedOrigin: string = '*') {
    return {
      allowedOrigin,
      messageTypes: {
        // Messages FROM iframe TO parent
        fromIframe: [
          'component-selected',
          'picker-ready',
          'picker-error',
          'picker-cancelled',
          'picker-load-error',
        ],
        // Messages FROM parent TO iframe
        toIframe: ['activate-picker', 'deactivate-picker', 'inject-script'],
      },
    };
  }

  /**
   * Validate a postMessage event
   *
   * Checks if a message event is valid and from an expected source
   */
  static validateMessage(
    event: MessageEvent,
    expectedTypes: string[]
  ): boolean {
    if (!event.data || typeof event.data !== 'object') {
      return false;
    }

    if (!event.data.type || typeof event.data.type !== 'string') {
      return false;
    }

    return expectedTypes.includes(event.data.type);
  }
}

/**
 * Type definitions for component selection
 */
export interface ComponentInfo {
  // React metadata
  componentName: string;
  props: Record<string, any>;

  // DOM info
  tagName: string;
  selector: string;
  className: string;
  id: string;

  // Content
  text: string;
  ariaLabel: string | null;
  title: string | null;
  placeholder: string | null;
  type: string | null;

  // Visual context
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    bottom: number;
    right: number;
  };

  // Hierarchy
  hierarchy: Array<{
    name: string;
    type: 'component' | 'element';
  }>;

  // Metadata
  timestamp: string;
}

export interface PickerMessage {
  type: string;
  data?: any;
  error?: string;
  timestamp?: string;
}
