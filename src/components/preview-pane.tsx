"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

interface PreviewPaneProps {
  sessionId: string;
  previewPort: number;
}

export function PreviewPane({ sessionId, previewPort }: PreviewPaneProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl] = useState(`http://localhost:${previewPort}`);
  const [key, setKey] = useState(0);

  useEffect(() => {
    // Reset loading state when URL changes
    setIsLoading(true);
    setError(null);
  }, [previewUrl]);

  const handleRefresh = () => {
    setKey((prev) => prev + 1);
    setIsLoading(true);
    setError(null);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setError("Failed to load preview. Make sure the dev server is running.");
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

        <div className="flex-1 flex items-center gap-2 bg-[#1a1a1a] rounded px-3 py-1.5 border border-[#2a2a2a]">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm text-gray-400 font-mono">{previewUrl}</span>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] z-10">
            <div className="text-gray-400">
              <div className="flex gap-1 mb-2">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-75" />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-150" />
              </div>
              <p className="text-sm">Loading preview...</p>
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
