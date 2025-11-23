"use client";

import { useState, useEffect, useRef } from "react";
import { RefreshCw, MousePointerClick } from "lucide-react";
import { ComponentInfo } from "@/lib/picker-injector";

interface PreviewPaneProps {
  sessionId: string;
  previewPort: number;
  onComponentSelected?: (component: ComponentInfo) => void;
}

export function PreviewPane({ sessionId, previewPort, onComponentSelected }: PreviewPaneProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl] = useState(`http://localhost:${previewPort}`);
  const [key, setKey] = useState(0);
  const [pickerSupported, setPickerSupported] = useState(false);
  const [pickerActive, setPickerActive] = useState(false);
  const [pickerReady, setPickerReady] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [buildStatus, setBuildStatus] = useState<string>('idle');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Reset loading state when URL changes
    setIsLoading(true);
    setError(null);
  }, [previewUrl]);

  // Poll session status until setup is complete
  useEffect(() => {
    if (!sessionId || setupComplete) return;

    let isMounted = true;
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/session/${sessionId}/status`);
        if (!response.ok) {
          throw new Error('Failed to fetch session status');
        }

        const data = await response.json();

        if (!isMounted) return;

        // Update build status for display
        setBuildStatus(data.buildStatus || 'idle');

        // Check if setup is complete
        if (data.previewReady === true) {
          console.log('[PreviewPane] Setup complete, preview ready');
          setSetupComplete(true);
          clearInterval(pollInterval);
        } else if (data.buildStatus === 'failed') {
          console.error('[PreviewPane] Setup failed');
          setError('Setup failed. Check the logs for details.');
          setIsLoading(false);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('[PreviewPane] Error polling session status:', error);
        // Don't set error here, keep polling in case of transient issues
      }
    }, 1000); // Poll every second

    // Cleanup
    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [sessionId, setupComplete]);

  // Add timeout for loading state (60 seconds to account for slow compilation)
  // Only start timeout AFTER setup is complete
  useEffect(() => {
    if (isLoading && setupComplete) {
      console.log('[PreviewPane] Starting 60s iframe load timeout');
      const timeout = setTimeout(() => {
        console.error('[PreviewPane] Preview loading timed out');
        setError('Preview loading timed out. The server might not be responding.');
        setIsLoading(false);
      }, 60000); // 60 second timeout
      return () => clearTimeout(timeout);
    }
  }, [isLoading, setupComplete]);

  // Check if picker is supported for this session
  useEffect(() => {
    if (sessionId) {
      fetch(`/api/container/${sessionId}/inject-picker`)
        .then((res) => res.json())
        .then((data) => {
          setPickerSupported(data.supported === true);
          if (!data.supported && data.reason) {
            console.log('[PreviewPane] Picker not supported:', data.reason);
          }
        })
        .catch((error) => {
          console.error('[PreviewPane] Error checking picker support:', error);
          setPickerSupported(false);
        });
    }
  }, [sessionId]);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Basic validation
      if (!event.data || typeof event.data !== 'object') return;

      const { type, data } = event.data;

      switch (type) {
        case 'picker-ready':
          console.log('[PreviewPane] Picker ready in iframe');
          setPickerReady(true);
          break;

        case 'component-selected':
          console.log('[PreviewPane] Component selected:', data);
          setPickerActive(false);
          if (onComponentSelected && data) {
            onComponentSelected(data);
          }
          break;

        case 'picker-cancelled':
          console.log('[PreviewPane] Picker cancelled');
          setPickerActive(false);
          break;

        case 'picker-error':
          console.error('[PreviewPane] Picker error:', event.data.error);
          setPickerActive(false);
          setError(event.data.error || 'Component selection failed');
          break;

        case 'picker-load-error':
          console.error('[PreviewPane] Picker load error');
          setPickerSupported(false);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onComponentSelected]);

  // Timeout for picker ready check
  useEffect(() => {
    if (pickerSupported && !pickerReady) {
      const timeout = setTimeout(() => {
        console.warn('[PreviewPane] Picker initialization timeout');
        // Don't disable picker support on timeout, it might load later
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [pickerSupported, pickerReady]);

  const handleRefresh = () => {
    setKey((prev) => prev + 1);
    setIsLoading(true);
    setError(null);
    setPickerReady(false); // Reset picker ready state on refresh
  };

  const handleLoad = () => {
    console.log('[PreviewPane] Iframe load event fired');
    setIsLoading(false);

    // Try to detect if iframe loaded with error content
    try {
      const iframeDoc = iframeRef.current?.contentWindow?.document;
      if (iframeDoc) {
        // Check for error indicators in the page content
        const bodyText = iframeDoc.body?.textContent || '';
        const bodyHTML = iframeDoc.body?.innerHTML || '';

        if (bodyText.includes('Cannot GET') ||
            bodyText.includes('404') ||
            bodyText.includes('502') ||
            bodyHTML.includes('502 Bad Gateway')) {
          console.error('[PreviewPane] Iframe loaded with error content:', bodyText.substring(0, 200));
          setError('Preview loaded but server returned an error. Check if the dev server is running correctly.');
          return;
        }

        console.log('[PreviewPane] Iframe loaded successfully');
      }
    } catch (e) {
      // CORS prevents access - this is actually OK for working preview
      // If we can't access the iframe content due to CORS, it means the content loaded from a different origin
      // which is expected and normal
      console.log('[PreviewPane] Iframe loaded (CORS protected - this is normal for working previews)');
    }

    // Inject picker script when iframe loads
    if (pickerSupported && iframeRef.current) {
      try {
        // The picker script is loaded via script tag in the iframe
        // We just need to wait for the picker-ready message
        console.log('[PreviewPane] Waiting for picker to initialize...');
      } catch (error) {
        console.error('[PreviewPane] Error during iframe load:', error);
      }
    }
  };

  const handleError = () => {
    setIsLoading(false);
    setError("Failed to load preview. Make sure the dev server is running.");
  };

  const handleActivatePicker = () => {
    if (!pickerSupported) {
      console.warn('[PreviewPane] Picker not supported');
      return;
    }

    if (!iframeRef.current) {
      console.warn('[PreviewPane] Iframe ref not available');
      return;
    }

    setPickerActive(true);
    setError(null);

    try {
      // Send message to iframe to activate picker
      iframeRef.current.contentWindow?.postMessage(
        { type: 'activate-picker' },
        '*'
      );

      // Focus iframe so it receives keyboard events (especially ESC key)
      iframeRef.current.focus();

      console.log('[PreviewPane] Picker activation message sent and iframe focused');
    } catch (error) {
      console.error('[PreviewPane] Error activating picker:', error);
      setPickerActive(false);
      setError('Failed to activate component picker');
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#2a2a2a] bg-black">
        <button
          onClick={handleRefresh}
          className="p-2 rounded hover:bg-[#1a1a1a] text-gray-400 hover:text-white transition-colors"
          title="Refresh preview"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {pickerSupported && (
          <button
            onClick={handleActivatePicker}
            disabled={pickerActive || !pickerReady}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              pickerActive
                ? 'bg-blue-600 text-white cursor-wait'
                : pickerReady
                ? 'bg-[#1a1a1a] text-gray-300 hover:bg-blue-600 hover:text-white border border-[#2a2a2a]'
                : 'bg-[#1a1a1a] text-gray-500 cursor-not-allowed border border-[#2a2a2a]'
            }`}
            title={
              pickerActive
                ? 'Selecting component... (Press ESC to cancel)'
                : pickerReady
                ? 'Select a component from the preview'
                : 'Waiting for picker to load...'
            }
          >
            <MousePointerClick className="w-4 h-4" />
            {pickerActive ? 'Selecting...' : 'Select Component'}
          </button>
        )}

        <div className="flex-1 flex items-center gap-2 bg-[#1a1a1a] rounded px-3 py-1.5 border border-[#2a2a2a]">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm text-gray-400 font-mono">{previewUrl}</span>
        </div>

        {pickerSupported && !pickerReady && (
          <span className="text-xs text-gray-500">Loading picker...</span>
        )}
      </div>

      {/* Preview Content */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] z-10">
            <div className="text-gray-400 text-center">
              <div className="flex gap-1 mb-3 justify-center">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-75" />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-150" />
              </div>
              {!setupComplete ? (
                <>
                  <p className="text-sm mb-1">Setting up environment...</p>
                  <p className="text-xs text-gray-500">
                    {buildStatus === 'cloning' && 'Cloning repository...'}
                    {buildStatus === 'building' && 'Installing dependencies and building...'}
                    {buildStatus === 'running' && 'Starting dev server...'}
                    {buildStatus === 'idle' && 'Initializing...'}
                  </p>
                </>
              ) : (
                <p className="text-sm">Loading preview...</p>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]">
            <div className="text-center">
              <p className="text-red-400 mb-2">{error}</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white rounded transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          key={key}
          src={previewUrl}
          className="w-full h-full border-0"
          onLoad={handleLoad}
          onError={handleError}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
