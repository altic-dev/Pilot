"use client";

import { useState, FormEvent, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ShimmeringText } from "@/components/animate-ui/text/shimmering";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AgentCard {
  id: string;
  agentType: string;
  agentAction: string;
  status: "thinking" | "completed";
  output: string;
}

interface CurrentQuery {
  id: string;
  content: string;
  isProcessing: boolean;
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [messages, setMessages] = useState<Message[]>(() => {
    if (initialQuery) {
      return [
        {
          id: "1",
          role: "user",
          content: initialQuery,
        },
      ];
    }
    return [];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentQuery, setCurrentQuery] = useState<CurrentQuery | null>(null);
  const [agentCards, setAgentCards] = useState<AgentCard[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Send initial query on mount if present
  useEffect(() => {
    if (initialQuery && !initialLoadRef.current) {
      initialLoadRef.current = true;
      sendMessage(initialQuery);
    }
  }, []);

  const sendMessage = async (messageContent: string) => {
    setIsLoading(true);

    // Set current query
    const queryId = Date.now().toString();
    setCurrentQuery({
      id: queryId,
      content: messageContent,
      isProcessing: true,
    });

    // Create thinking agent card
    const agentId = `agent_${queryId}`;
    setAgentCards([
      {
        id: agentId,
        agentType: "project_retrieval",
        agentAction: "Retrieving project information",
        status: "thinking",
        output: "",
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messages
            .filter((m) => m.content !== messageContent)
            .concat({
              role: "user",
              content: messageContent,
            }),
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch");

      const data = await response.json();
      console.log(`Retrieved data: ${JSON.stringify(data)}`);

      // Update agent card with result
      setAgentCards((prev) =>
        prev.map((card) =>
          card.id === agentId
            ? {
                ...card,
                status: "completed",
                output: data.text,
              }
            : card,
        ),
      );

      // Add agent response to messages and clear temporary UI
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.text,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setCurrentQuery(null);
      setAgentCards([]);
    } catch (error) {
      console.error("Error:", error);

      // Update agent card with error
      setAgentCards((prev) =>
        prev.map((card) =>
          card.id === agentId
            ? {
                ...card,
                status: "completed",
                output: "Sorry, I encountered an error. Please try again.",
              }
            : card,
        ),
      );

      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "Sorry, I encountered an error. Please try again.",
      };

      setMessages((prev) => [...prev, errorMessage]);
      setCurrentQuery(null);
      setAgentCards([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    sendMessage(input.trim());
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="w-full p-4 border-b border-[#2a2a2a]">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-[#888888] hover:text-white transition-colors"
          >
            ← Back
          </Link>
        </div>
      </header>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col max-w-4xl w-full mx-auto">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className="w-full">
              <div
                className={`w-full px-4 py-3 rounded-lg ${
                  message.role === "user"
                    ? "bg-[#1f1f1f] border border-[#3a3a3a] text-gray-400"
                    : "bg-[#1a1a1a] text-gray-100 border border-[#2a2a2a]"
                }`}
              >
                {message.role === "assistant" ? (
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                ) : (
                  <p className="whitespace-pre-wrap text-sm">
                    {message.content}
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Agent Cards */}
          {agentCards.length > 0 && (
            <div className="w-full space-y-3">
              {agentCards.map((card) => (
                <div
                  key={card.id}
                  className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <ShimmeringText text={card.agentAction} />
                  </div>
                  <div className="text-sm text-gray-100">
                    {card.status !== "thinking" && (
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {card.output}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input form */}
        <div className="mt-auto border-t border-[#2a2a2a] p-4">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a follow-up question..."
                className="flex-1 px-4 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg focus:outline-none focus:border-[#3a3a3a] text-white placeholder-[#666666] text-sm"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-2.5 bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
