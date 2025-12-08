"use client";

import { useState, useEffect, FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ModelSelector } from "@/components/model-selector";
import {
  ModelProvider,
  isProviderValid,
  MODEL_CONFIGS,
} from "@/lib/model-provider";

export default function Home() {
  const [input, setInput] = useState("");
  const router = useRouter();

  // Initialize from localStorage directly (client-side only)
  const [selectedModel, setSelectedModel] = useState<ModelProvider>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pilot-selected-model");
      if (saved && isProviderValid(saved)) {
        return saved as ModelProvider;
      }
    }
    return "sonnet";
  });

  // Persist model selection to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("pilot-selected-model", selectedModel);
    }
  }, [selectedModel]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Redirect to chat page with query
    router.push(`/chat?q=${encodeURIComponent(input)}`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div className="brutalist-grid-bg min-h-screen flex flex-col items-center justify-center px-4">
      {/* Background */}
      <div
        className="absolute inset-0 -z-10"
        style={{ backgroundColor: "var(--brutalist-bg)" }}
      />

      <div className="w-full max-w-4xl">
        {/* Brutalist Header */}
        <div className="mb-12">
          <h1 className="text-6xl font-bold uppercase tracking-tight mb-4">
            PILOT
          </h1>
          <div
            className="w-32 mb-4"
            style={{ borderTop: "4px solid var(--brutalist-text-primary)" }}
          />
          <p
            className="text-xl uppercase tracking-wide"
            style={{ color: "var(--brutalist-text-secondary)" }}
          >
            A/B Testing Agent
          </p>
        </div>

        {/* Heavy Geometric Form */}
        <div className="brutalist-block-heavy brutalist-shadow-lg">
          <form onSubmit={handleSubmit}>
            {/* Input Area */}
            <div
              className="p-6"
              style={{ borderBottom: "4px solid var(--brutalist-border)" }}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your experiment..."
                className="w-full resize-none bg-transparent outline-none text-base h-32 p-0"
                style={{
                  fontFamily: "var(--font-sans)",
                  color: "var(--brutalist-text-primary)",
                  caretColor: "var(--brutalist-text-primary)",
                }}
              />
              <style jsx>{`
                textarea::placeholder {
                  color: var(--brutalist-text-muted);
                }
              `}</style>
            </div>

            {/* Control Bar */}
            <div
              className="p-6 flex items-center justify-between gap-4"
              style={{ backgroundColor: "var(--brutalist-surface)" }}
            >
              <ModelSelector
                value={selectedModel}
                onChange={setSelectedModel}
                dropdownDirection="down"
              />

              {/* Execute Button - Heavy Brutalist */}
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-8 py-3 text-sm uppercase font-bold tracking-wider transition-all brutalist-shadow-md hover:translate-x-1 hover:translate-y-1 hover:shadow-none disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  border: "4px solid var(--brutalist-text-primary)",
                  backgroundColor: "var(--brutalist-text-primary)",
                  color: "var(--brutalist-bg)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--brutalist-text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--brutalist-text-primary)";
                  e.currentTarget.style.color = "var(--brutalist-bg)";
                }}
              >
                Execute
              </button>
            </div>
          </form>
        </div>

        {/* Geometric Accent Element */}
        <div className="mt-12 grid grid-cols-3 gap-2">
          <div
            className="h-2"
            style={{ backgroundColor: "var(--brutalist-border)" }}
          />
          <div
            className="h-2"
            style={{ backgroundColor: "var(--brutalist-border-heavy)" }}
          />
          <div
            className="h-2"
            style={{ backgroundColor: "var(--brutalist-border)" }}
          />
        </div>
      </div>
    </div>
  );
}
