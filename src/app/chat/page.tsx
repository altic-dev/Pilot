"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ToolInvocation } from "@/components/tool-invocation";
import { PreviewPane } from "@/components/preview-pane";
import { ComponentContextPill } from "@/components/component-context-pill";
import { ComponentInfo } from "@/lib/picker-injector";

function ChatContent() {
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [previewPort, setPreviewPort] = useState<number | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<ComponentInfo | null>(null);
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialMessageSent = useRef(false);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  // Extract sessionId and previewPort from tool invocations
  useEffect(() => {
    for (const message of messages) {
      for (const part of message.parts) {
        // Check if this is a completed repoSetup tool invocation
        if (
          typeof part.type === "string" &&
          part.type === "tool-repoSetup" &&
          (part as any).state === "output-available"
        ) {
          const output = (part as any).output;

          if (output?.sessionId) {
            setSessionId(output.sessionId);
            setPreviewPort(output.previewPort);
            break;
          }
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    if (initialQuery && messages.length === 0 && !initialMessageSent.current) {
      initialMessageSent.current = true;
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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status === "ready") {
      // Include selected component context in the message if available
      let messageText = input;

      if (selectedComponent) {
        messageText = `[SELECTED COMPONENT]\n${JSON.stringify(selectedComponent, null, 2)}\n\n[USER MESSAGE]\n${input}`;
      }

      sendMessage({
        parts: [
          {
            type: "text",
            text: messageText,
          },
        ],
      });
      setInput("");
      // Note: We keep the selected component after sending,
      // so user can ask multiple questions about it
      // To clear: user can click the X button on the pill

      // Reset textarea height after submission
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  return (
    <div className="flex h-screen bg-black">
      {/* Left: Chat Panel */}
      <div className="flex flex-col w-[40%] border-r border-[#2a2a2a]">
        {/* Messages container */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-full mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
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
          <form onSubmit={handleSubmit} className="max-w-full mx-auto">
            {/* Selected component pill */}
            {selectedComponent && (
              <div className="mb-3">
                <ComponentContextPill
                  component={selectedComponent}
                  onClear={() => setSelectedComponent(null)}
                />
              </div>
            )}

            <div className="bg-[#1a1a1a] rounded-xl border border-[#2a2a2a] p-4">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={status !== "ready"}
                placeholder="Send a message..."
                rows={1}
                className="w-full bg-transparent text-white placeholder-[#666666] outline-none text-sm resize-none overflow-hidden"
                style={{
                  minHeight: "24px",
                }}
              />

              {/* Bottom bar with send button */}
              <div className="flex items-center justify-end mt-3">
                <button
                  type="submit"
                  disabled={!input.trim() || status !== "ready"}
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

      {/* Right: Preview Panel */}
      <div className="flex flex-col w-[60%]">
        {/* Preview Content */}
        <div className="flex-1 overflow-hidden">
          {sessionId && previewPort ? (
            <PreviewPane
              sessionId={sessionId}
              previewPort={previewPort}
              onComponentSelected={setSelectedComponent}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 bg-[#0a0a0a]">
              <p>No preview available. Provide a GitHub URL to get started.</p>
            </div>
          )}
        </div>
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
