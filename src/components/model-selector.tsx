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
        className="flex items-center gap-3 px-4 py-2 text-sm uppercase tracking-wide font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          border: "2px solid var(--brutalist-border)",
          backgroundColor: "var(--brutalist-elevated)",
          color: "var(--brutalist-text-primary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--brutalist-border-heavy)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--brutalist-border)";
        }}
      >
        {/* Geometric Icon */}
        <span className="w-3 h-3" style={{ border: "2px solid var(--brutalist-text-primary)" }} />
        <span>{MODEL_CONFIGS[value].displayName}</span>
        {/* Hard Chevron */}
        <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown - Heavy Border */}
          <div
            className={`absolute left-0 z-20 w-72 brutalist-shadow-md ${
              dropdownDirection === "up" ? "bottom-full mb-2" : "top-full mt-2"
            }`}
            style={{
              border: "4px solid var(--brutalist-border)",
              backgroundColor: "var(--brutalist-surface)",
            }}
          >
            {Object.entries(MODEL_CONFIGS).map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key as ModelProvider);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-4 text-left transition-colors last:border-b-0"
                style={{
                  borderBottom: "2px solid var(--brutalist-border)",
                  backgroundColor:
                    value === key ? "var(--brutalist-text-primary)" : "transparent",
                  color: value === key ? "var(--brutalist-bg)" : "var(--brutalist-text-primary)",
                  fontWeight: value === key ? "bold" : "normal",
                }}
                onMouseEnter={(e) => {
                  if (value !== key) {
                    e.currentTarget.style.backgroundColor = "var(--brutalist-elevated)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (value !== key) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <div className="font-bold text-sm uppercase tracking-wide">
                  {config.displayName}
                </div>
                <div className="mt-1 text-xs opacity-70 font-mono">
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
