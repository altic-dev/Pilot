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

/**
 * Capitalize first letter of each word
 */
function capitalizeWords(text: string): string {
  return text.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Generate a simple, user-friendly 2-3 word label for the component
 */
function generateComponentLabel(component: ComponentInfo): string {
  // Priority 1: Use aria-label (most semantic)
  if (component.ariaLabel) {
    return capitalizeWords(component.ariaLabel);
  }

  // Priority 2: Use title attribute
  if (component.title) {
    return capitalizeWords(component.title);
  }

  // Priority 3: For inputs, use placeholder or type
  if (component.tagName === 'input') {
    if (component.placeholder) {
      return `${capitalizeWords(component.placeholder.slice(0, 20))} Input`;
    }
    if (component.type) {
      return `${capitalizeWords(component.type)} Input`;
    }
    return 'Text Input';
  }

  // Priority 4: For images, use descriptive name
  if (component.tagName === 'img') {
    if (component.className?.includes('hero')) return 'Hero Image';
    if (component.className?.includes('logo')) return 'Logo';
    if (component.className?.includes('avatar')) return 'Avatar';
    if (component.className?.includes('icon')) return 'Icon';
    return 'Image';
  }

  // Priority 5: For buttons, combine text with "Button"
  if (component.tagName === 'button' || component.type === 'submit' || component.type === 'button') {
    if (component.text && component.text.trim().length > 0) {
      const buttonText = component.text.trim().split(/\s+/).slice(0, 2).join(' ');
      return `${capitalizeWords(buttonText)} Button`;
    }
    return 'Button';
  }

  // Priority 6: Meaningful component names (not generic HTML tags)
  const genericTags = ['div', 'span', 'section', 'article', 'main', 'aside'];
  if (component.componentName &&
      !genericTags.includes(component.componentName.toLowerCase())) {
    return component.componentName;
  }

  // Priority 7: Use first 2-3 words of text content
  if (component.text && component.text.trim().length > 0) {
    const words = component.text.trim().split(/\s+/).slice(0, 3).join(' ');
    if (words.length > 0 && words.length < 40) {
      return capitalizeWords(words);
    }
  }

  // Priority 8: Fallback based on tag name
  const tagLabels: Record<string, string> = {
    'a': 'Link',
    'textarea': 'Text Area',
    'select': 'Dropdown',
    'header': 'Header',
    'footer': 'Footer',
    'nav': 'Navigation',
    'h1': 'Main Heading',
    'h2': 'Subheading',
    'h3': 'Section Heading',
    'h4': 'Heading',
    'h5': 'Heading',
    'h6': 'Heading',
    'form': 'Form',
    'table': 'Table',
    'ul': 'List',
    'ol': 'List',
    'li': 'List Item',
  };

  return tagLabels[component.tagName] || 'Component';
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

          {/* Main info - Simple user-friendly label */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">
              {generateComponentLabel(component)}
            </span>
            {component.text && component.text.length > 30 && (
              <span className="text-xs text-gray-400">
                • {component.text.slice(0, 40)}...
              </span>
            )}
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-3 space-y-2 text-xs">
              {/* Hierarchy */}
              {hierarchyText && (
                <div className="bg-black/30 rounded p-2">
                  <div className="text-gray-400">
                    <span className="text-blue-400 font-semibold">Hierarchy:</span>{" "}
                    <code className="text-gray-300">{hierarchyText}</code>
                  </div>
                </div>
              )}

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
