/**
 * Component Context Pill
 *
 * Displays information about a selected React component
 * Shows component name, text content, and additional metadata
 */

"use client";

import { useState } from "react";
import { X, ChevronDown, ChevronRight } from "lucide-react";
import { ComponentInfo } from "@/lib/picker-injector";

interface ComponentContextPillProps {
  component: ComponentInfo;
  onClear: () => void;
}

export function ComponentContextPill({
  component,
  onClear,
}: ComponentContextPillProps) {
  const [expanded, setExpanded] = useState(false);

  // Format component hierarchy for display
  const hierarchyText = component.hierarchy
    ?.map((h) => h.name)
    .slice(-3)
    .join(" > ");

  // Truncate long text
  const displayText = component.text
    ? component.text.length > 80
      ? component.text.slice(0, 80) + "..."
      : component.text
    : "";

  // Get relevant props for display (exclude internal/function props)
  const displayProps = component.props
    ? Object.entries(component.props)
        .filter(([key, value]) => {
          return (
            !key.startsWith("__") &&
            !key.startsWith("_") &&
            value !== "[Function]" &&
            value !== "[Circular]"
          );
        })
        .slice(0, 5) // Limit to 5 props
    : [];

  return (
    <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg p-3 mb-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide">
              Selected Component
            </span>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-blue-400 hover:text-blue-300 transition-colors"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Main info */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-white">
              &lt;{component.componentName}&gt;
            </span>
            {displayText && (
              <span className="text-sm text-gray-300 italic">
                "{displayText}"
              </span>
            )}
          </div>

          {/* Hierarchy */}
          {hierarchyText && (
            <div className="mt-1 text-xs text-gray-400 font-mono truncate">
              {hierarchyText}
            </div>
          )}

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 space-y-2 text-xs">
              {/* DOM Info */}
              <div className="bg-black/30 rounded p-2 space-y-1">
                <div className="text-gray-400">
                  <span className="text-blue-400 font-semibold">Tag:</span>{" "}
                  <code className="text-gray-300">{component.tagName}</code>
                </div>
                {component.selector && (
                  <div className="text-gray-400">
                    <span className="text-blue-400 font-semibold">
                      Selector:
                    </span>{" "}
                    <code className="text-gray-300 text-[10px] break-all">
                      {component.selector}
                    </code>
                  </div>
                )}
                {component.className && (
                  <div className="text-gray-400">
                    <span className="text-blue-400 font-semibold">Class:</span>{" "}
                    <code className="text-gray-300">{component.className}</code>
                  </div>
                )}
                {component.id && (
                  <div className="text-gray-400">
                    <span className="text-blue-400 font-semibold">ID:</span>{" "}
                    <code className="text-gray-300">{component.id}</code>
                  </div>
                )}
              </div>

              {/* Attributes */}
              {(component.ariaLabel ||
                component.title ||
                component.placeholder ||
                component.type) && (
                <div className="bg-black/30 rounded p-2 space-y-1">
                  <div className="text-blue-400 font-semibold mb-1">
                    Attributes
                  </div>
                  {component.ariaLabel && (
                    <div className="text-gray-400">
                      <span className="text-purple-400">aria-label:</span>{" "}
                      {component.ariaLabel}
                    </div>
                  )}
                  {component.title && (
                    <div className="text-gray-400">
                      <span className="text-purple-400">title:</span>{" "}
                      {component.title}
                    </div>
                  )}
                  {component.placeholder && (
                    <div className="text-gray-400">
                      <span className="text-purple-400">placeholder:</span>{" "}
                      {component.placeholder}
                    </div>
                  )}
                  {component.type && (
                    <div className="text-gray-400">
                      <span className="text-purple-400">type:</span>{" "}
                      {component.type}
                    </div>
                  )}
                </div>
              )}

              {/* Props */}
              {displayProps.length > 0 && (
                <div className="bg-black/30 rounded p-2 space-y-1">
                  <div className="text-blue-400 font-semibold mb-1">
                    React Props
                  </div>
                  {displayProps.map(([key, value]) => (
                    <div key={key} className="text-gray-400">
                      <span className="text-green-400">{key}:</span>{" "}
                      <span className="text-gray-300">
                        {typeof value === "object"
                          ? JSON.stringify(value).slice(0, 50) + "..."
                          : String(value).slice(0, 50)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Full text if longer */}
              {component.text && component.text.length > 80 && (
                <div className="bg-black/30 rounded p-2">
                  <div className="text-blue-400 font-semibold mb-1">
                    Full Text
                  </div>
                  <div className="text-gray-300 text-[11px] max-h-20 overflow-y-auto">
                    {component.text}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clear button */}
        <button
          onClick={onClear}
          className="flex-shrink-0 p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
          aria-label="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
