"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolInvocation } from "@/components/tool-invocation";

function ChatContent() {
  const [input, setInput] = useState("");
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  useEffect(() => {
    if (initialQuery && messages.length === 0) {
      sendMessage({
        parts: [
          {
            type: "text",
            text: initialQuery,
          },
        ],
      });
    }
  }, [initialQuery, messages.length, sendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      sendMessage({
        parts: [
          {
            type: "text",
            text: input,
          },
        ],
      });
      setInput("");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Messages container */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"
                }`}
            >
              <div
                className={`rounded-lg px-4 py-3 max-w-[80%] ${message.role === "user"
                  ? "bg-[#1a1a1a] text-white"
                  : "bg-[#0f0f0f] text-gray-200 border border-[#2a2a2a]"
                  }`}
              >
                {message.parts.map((part, partIndex) => {
                  if (part.type === "text") {
                    return (
                      <div
                        key={`${message.id}-text-${partIndex}`}
                        className="prose prose-invert prose-sm max-w-none"
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code: ({ className, children, ...props }) => {
                              const match = /language-(\w+)/.exec(className || "");
                              return match ? (
                                <pre className="bg-[#1a1a1a] rounded p-3 overflow-x-auto">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              ) : (
                                <code
                                  className="bg-[#1a1a1a] rounded px-1 py-0.5"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            },
                            p: ({ children }) => (
                              <p className="mb-2 last:mb-0">{children}</p>
                            ),
                            ul: ({ children }) => (
                              <ul className="list-disc ml-4 mb-2">{children}</ul>
                            ),
                            ol: ({ children }) => (
                              <ol className="list-decimal ml-4 mb-2">{children}</ol>
                            ),
                            li: ({ children }) => <li className="mb-1">{children}</li>,
                          }}
                        >
                          {part.text}
                        </ReactMarkdown>
                      </div>
                    );
                  }

                  // Handle tool invocation parts
                  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
                    return (
                      <ToolInvocation
                        key={`${message.id}-tool-${partIndex}`}
                        invocation={part as any}
                      />
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          ))}
          {status === "streaming" && (
            <div className="flex gap-4 justify-start">
              <div className="bg-[#0f0f0f] text-gray-400 border border-[#2a2a2a] rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-75" />
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-150" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input container */}
      <div className="border-t border-[#2a2a2a] bg-black px-4 py-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] px-4 py-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={status !== "ready"}
                placeholder="Send a message..."
                className="w-full bg-transparent text-white placeholder-[#666666] outline-none text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || status !== "ready"}
              className="px-4 py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-screen bg-black items-center justify-center text-gray-400">Loading...</div>}>
      <ChatContent />
    </Suspense>
  );
}
