"use client";

import { useState, FormEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { StarsBackground } from "@/components/animate-ui/backgrounds/stars";

export default function Home() {
  const [input, setInput] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Redirect to chat page with query and mode
    router.push(`/chat?q=${encodeURIComponent(input)}`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <StarsBackground className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-3xl">
        {/* Main heading */}
        <h1 className="text-[#888888] text-base mb-8 text-center">
          Pilot - Your A/B testing agent
        </h1>

        {/* Input container */}
        <div className="relative">
          <form onSubmit={handleSubmit}>
            <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] p-4">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter details of your experiment ..."
                className="w-full bg-transparent text-white placeholder-[#666666] resize-none outline-none text-sm"
                rows={3}
                style={{ minHeight: "60px" }}
              />

              {/* Bottom bar with mode selector and search button */}
              <div className="flex items-center justify-end mt-3">
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="p-1.5 rounded-full border border-[#3a3a3a] bg-transparent text-[#888888] hover:text-white hover:border-[#4a4a4a] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
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
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </StarsBackground>
  );
}
