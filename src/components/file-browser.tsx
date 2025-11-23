"use client";

import React, { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";

interface FileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  path: string;
}

interface FileBrowserProps {
  sessionId: string;
}

export function FileBrowser({ sessionId }: FileBrowserProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(["/workspace/repo"]));
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDirectory("/workspace/repo");
  }, [sessionId]);

  const loadDirectory = async (dirPath: string) => {
    try {
      const response = await fetch(
        `/api/container/${sessionId}/files?path=${encodeURIComponent(dirPath)}`
      );

      if (!response.ok) {
        throw new Error("Failed to load directory");
      }

      const entries: FileEntry[] = await response.json();

      // Add entries to files list (avoid duplicates)
      setFiles((prev) => {
        const newFiles = [...prev];
        for (const entry of entries) {
          if (!newFiles.some((f) => f.path === entry.path)) {
            newFiles.push(entry);
          }
        }
        return newFiles;
      });

      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory");
      setLoading(false);
    }
  };

  const toggleDirectory = async (dirPath: string) => {
    const newExpanded = new Set(expandedDirs);

    if (expandedDirs.has(dirPath)) {
      newExpanded.delete(dirPath);
    } else {
      newExpanded.add(dirPath);
      // Load directory contents if not already loaded
      await loadDirectory(dirPath);
    }

    setExpandedDirs(newExpanded);
  };

  const selectFile = async (filePath: string) => {
    setSelectedFile(filePath);

    try {
      const response = await fetch(
        `/api/container/${sessionId}/file-content?path=${encodeURIComponent(filePath)}`
      );

      if (!response.ok) {
        throw new Error("Failed to load file");
      }

      const content = await response.text();
      setFileContent(content);
    } catch (err) {
      setFileContent(`Error: ${err instanceof Error ? err.message : "Failed to load file"}`);
    }
  };

  const renderTree = (parentPath: string, level: number = 0): React.JSX.Element[] => {
    const children = files.filter((f) => {
      const fDir = f.path.substring(0, f.path.lastIndexOf("/"));
      return fDir === parentPath;
    });

    return children.map((entry) => {
      const isExpanded = expandedDirs.has(entry.path);
      const isDirectory = entry.type === "directory";

      return (
        <div key={entry.path}>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 hover:bg-[#1a1a1a] cursor-pointer ${
              selectedFile === entry.path ? "bg-[#2a2a2a]" : ""
            }`}
            style={{ paddingLeft: `${level * 20 + 12}px` }}
            onClick={() => {
              if (isDirectory) {
                toggleDirectory(entry.path);
              } else {
                selectFile(entry.path);
              }
            }}
          >
            {isDirectory ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                <Folder className="w-4 h-4 text-blue-400" />
              </>
            ) : (
              <>
                <div className="w-4" /> {/* Spacer */}
                <File className="w-4 h-4 text-gray-400" />
              </>
            )}
            <span className="text-sm text-gray-200">{entry.name}</span>
          </div>

          {isDirectory && isExpanded && renderTree(entry.path, level + 1)}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>Loading files...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* File Tree */}
      <div className="w-1/3 border-r border-[#2a2a2a] overflow-y-auto">
        <div className="py-2">{renderTree("/workspace", 0)}</div>
      </div>

      {/* File Content */}
      <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
        {selectedFile && fileContent !== null ? (
          <div className="p-4">
            <div className="mb-4 pb-2 border-b border-[#2a2a2a]">
              <p className="text-xs text-gray-400">{selectedFile}</p>
            </div>
            <pre className="text-sm text-gray-200 font-mono whitespace-pre-wrap">
              {fileContent}
            </pre>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <p>Select a file to view its contents</p>
          </div>
        )}
      </div>
    </div>
  );
}
