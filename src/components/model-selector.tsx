"use client";

import { useState } from "react";
import { MODEL_CONFIGS, ModelProvider } from "@/lib/model-provider";

interface ModelSelectorProps {
  value: ModelProvider;
  onChange: (provider: ModelProvider) => void;
  disabled?: boolean;
  dropdownDirection?: "up" | "down";
}

export function ModelSelector({
  value,
  onChange,
  disabled,
  dropdownDirection = "up",
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-gray-300 text-sm hover:border-[#3a3a3a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {/* Icon */}
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
          />
        </svg>
        <span>{MODEL_CONFIGS[value].displayName}</span>
        {/* Chevron icon */}
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className={`absolute left-0 w-64 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] shadow-xl z-20 overflow-hidden ${
            dropdownDirection === "up" ? "bottom-full mb-1" : "top-full mt-1"
          }`}>
            {Object.entries(MODEL_CONFIGS).map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key as ModelProvider);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2.5 text-left text-sm transition-colors ${
                  value === key
                    ? "bg-[#2a2a2a] text-white"
                    : "text-gray-300 hover:bg-[#222222]"
                }`}
              >
                <div className="font-medium">{config.displayName}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {config.modelId}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
