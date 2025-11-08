"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, Clock } from "lucide-react";

// Type definitions for tool invocation parts
type ToolInvocationState = "input-available" | "output-available";

interface BaseToolInvocation {
  type: string;
  toolName: string;
  state: ToolInvocationState;
  input: any;
  output?: any;
}

type ProjectRetrievalInput = Record<string, never>;

interface ProjectRetrievalOutput {
  projectId: number;
  projectName: string;
  projectUrl: string;
}

interface ExperimentCreationInput {
  projectId: string;
  name: string;
  description: string;
  featureFlagKey: string;
}

interface ExperimentCreationOutput {
  success: boolean;
  experimentId: number;
  name: string;
  featureFlagKey: string;
}

interface ExperimentCodeUpdateInput {
  githubUrl: string;
  featureFlagKey: string;
  hypothesis: string;
}

interface ExperimentCodeUpdateOutput {
  result: string;
}

interface TextVariationInput {
  context: string;
  existingText?: string;
  targetAudience?: string;
  tone?: string;
}

interface TextVariationOutput {
  variation: string;
  approach: string;
}

// Tool-specific formatters
function formatProjectRetrievalInput(input: ProjectRetrievalInput) {
  return (
    <div className="text-sm text-gray-400">
      <p>Fetching PostHog project information...</p>
    </div>
  );
}

function formatProjectRetrievalOutput(output: any) {
  return (
    <div className="space-y-2">
      {output?.projectName && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Project:</span>
          <span className="text-sm text-gray-200 font-medium">{output.projectName}</span>
        </div>
      )}
      {output?.projectId && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">ID:</span>
          <span className="text-sm text-gray-200">{output.projectId}</span>
        </div>
      )}
      {output?.projectUrl && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">URL:</span>
          <a
            href={output.projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            {output.projectUrl}
          </a>
        </div>
      )}
    </div>
  );
}

function formatExperimentCreationInput(input: any) {
  return (
    <div className="space-y-2">
      {input?.name && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Name:</span>
          <span className="text-sm text-gray-200">{input.name}</span>
        </div>
      )}
      {input?.description && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Description:</span>
          <span className="text-sm text-gray-200">{input.description}</span>
        </div>
      )}
      {input?.featureFlagKey && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Feature Flag:</span>
          <code className="text-sm text-gray-200 bg-[#1a1a1a] px-2 py-0.5 rounded">
            {input.featureFlagKey}
          </code>
        </div>
      )}
      {input?.projectId && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Project ID:</span>
          <span className="text-sm text-gray-200">{input.projectId}</span>
        </div>
      )}
      {!input || Object.keys(input).length === 0 && (
        <div className="text-sm text-gray-400">Creating experiment...</div>
      )}
    </div>
  );
}

function formatExperimentCreationOutput(output: any) {
  return (
    <div className="space-y-2">
      {output?.success !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Status:</span>
          <span className="text-sm text-green-400">
            {output.success ? "✓ Created successfully" : "✗ Failed"}
          </span>
        </div>
      )}
      {output?.experimentId && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Experiment ID:</span>
          <span className="text-sm text-gray-200">{output.experimentId}</span>
        </div>
      )}
      {output?.name && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Name:</span>
          <span className="text-sm text-gray-200">{output.name}</span>
        </div>
      )}
      {output?.featureFlagKey && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Feature Flag:</span>
          <code className="text-sm text-gray-200 bg-[#1a1a1a] px-2 py-0.5 rounded">
            {output.featureFlagKey}
          </code>
        </div>
      )}
    </div>
  );
}

function formatExperimentCodeUpdateInput(input: any) {
  return (
    <div className="space-y-2">
      {input?.githubUrl && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">GitHub URL:</span>
          <a
            href={input.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 underline break-all"
          >
            {input.githubUrl}
          </a>
        </div>
      )}
      {input?.featureFlagKey && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Feature Flag:</span>
          <code className="text-sm text-gray-200 bg-[#1a1a1a] px-2 py-0.5 rounded">
            {input.featureFlagKey}
          </code>
        </div>
      )}
      {input?.hypothesis && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Hypothesis:</span>
          <span className="text-sm text-gray-200">{input.hypothesis}</span>
        </div>
      )}
    </div>
  );
}

function formatExperimentCodeUpdateOutput(output: string) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-sm text-gray-400">Result:</span>
      </div>
      <div className="text-sm text-gray-200 bg-[#1a1a1a] p-3 rounded max-h-60 overflow-y-auto">
        <pre className="whitespace-pre-wrap break-words">{output}</pre>
      </div>
    </div>
  );
}

function formatTextVariationInput(input: any) {
  return (
    <div className="space-y-2">
      {input?.context && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Context:</span>
          <span className="text-sm text-gray-200">{input.context}</span>
        </div>
      )}
      {input?.existingText && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Existing Text:</span>
          <code className="text-sm text-gray-200 bg-[#1a1a1a] px-2 py-1 rounded break-words">
            {input.existingText}
          </code>
        </div>
      )}
      {input?.targetAudience && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Target Audience:</span>
          <span className="text-sm text-gray-200">{input.targetAudience}</span>
        </div>
      )}
      {input?.tone && (
        <div className="flex items-start gap-2">
          <span className="text-sm text-gray-400 min-w-[120px]">Tone:</span>
          <span className="text-sm text-gray-200">{input.tone}</span>
        </div>
      )}
    </div>
  );
}

function formatTextVariationOutput(output: any) {
  // Parse JSON string if needed
  let parsedOutput = output;
  if (typeof output === 'string') {
    try {
      parsedOutput = JSON.parse(output);
    } catch (e) {
      // If parsing fails, return error message
      return (
        <div className="text-sm text-red-400">
          Failed to parse output
        </div>
      );
    }
  }

  return (
    <div className="space-y-3">
      {parsedOutput?.variation && (
        <div className="space-y-1">
          <span className="text-sm text-gray-400">Variation:</span>
          <div className="text-sm text-gray-200 bg-[#1a1a1a] p-3 rounded border border-[#2a2a2a]">
            {parsedOutput.variation}
          </div>
        </div>
      )}
      {parsedOutput?.approach && (
        <div className="space-y-1">
          <span className="text-sm text-gray-400">Approach:</span>
          <div className="text-sm text-gray-300 italic">
            {parsedOutput.approach}
          </div>
        </div>
      )}
    </div>
  );
}

// Main component
export function ToolInvocation({ invocation }: { invocation: BaseToolInvocation }) {
  const [isOpen, setIsOpen] = useState(true);

  const isComplete = invocation.state === "output-available";

  // Extract tool name from type (e.g., "tool-projectRetrieval" -> "projectRetrieval")
  // or use toolName if available
  const toolName = invocation.toolName ||
    (typeof invocation.type === "string" && invocation.type.startsWith("tool-")
      ? invocation.type.substring(5)
      : "unknown");

  // Format tool name for display
  const displayName = toolName
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

  // Render tool-specific input
  const renderInput = () => {
    switch (toolName) {
      case "projectRetrieval":
        return formatProjectRetrievalInput(invocation.input);
      case "experimentCreation":
        return formatExperimentCreationInput(invocation.input);
      case "experimentCodeUpdate":
        return formatExperimentCodeUpdateInput(invocation.input);
      case "textVariation":
        return formatTextVariationInput(invocation.input);
      default:
        return (
          <div className="text-sm text-gray-300">
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(invocation.input, null, 2)}
            </pre>
          </div>
        );
    }
  };

  // Render tool-specific output
  const renderOutput = () => {
    if (!isComplete || !invocation.output) return null;

    switch (toolName) {
      case "projectRetrieval":
        return formatProjectRetrievalOutput(invocation.output);
      case "experimentCreation":
        return formatExperimentCreationOutput(invocation.output);
      case "experimentCodeUpdate":
        return formatExperimentCodeUpdateOutput(invocation.output);
      case "textVariation":
        return formatTextVariationOutput(invocation.output);
      default:
        return (
          <div className="text-sm text-gray-300">
            <pre className="whitespace-pre-wrap break-words">
              {JSON.stringify(invocation.output, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <div className="my-3 bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a1a1a] transition-colors"
      >
        {/* Expand/Collapse Icon */}
        <div className="text-gray-400">
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>

        {/* Status Icon */}
        <div>
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          )}
        </div>

        {/* Tool Name */}
        <span className="text-sm font-medium text-gray-200">{displayName}</span>

        {/* Status Text */}
        <span className="text-xs text-gray-500 ml-auto">
          {isComplete ? "Completed" : "Running..."}
        </span>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="px-4 pb-4 pt-2 border-t border-[#2a2a2a] space-y-4">
          {/* Input Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Input
              </h4>
            </div>
            <div className="pl-5">{renderInput()}</div>
          </div>

          {/* Output Section */}
          {isComplete && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-gray-500" />
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Output
                </h4>
              </div>
              <div className="pl-5">{renderOutput()}</div>
            </div>
          )}

          {/* Loading State */}
          {!isComplete && (
            <div className="pl-5 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Waiting for results...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

