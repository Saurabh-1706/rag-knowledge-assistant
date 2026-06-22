'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Trash2, Cpu, MessageSquare, AlertCircle, Bookmark } from 'lucide-react';
import { sendChatMessage, ChatMessage, ChatSource } from '@/lib/api';

interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  queryUsed?: string;
  notice?: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [retrievalMode, setRetrievalMode] = useState<string>('vector');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Adjust textarea height dynamically based on input length
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();
    setInputValue('');
    setError(null);
    setIsLoading(true);

    const userMessageId = Math.random().toString(36).substring(7);
    const assistantMessageId = Math.random().toString(36).substring(7);

    // 1. Add user message locally
    const newUserMsg: UIMessage = {
      id: userMessageId,
      role: 'user',
      content: userText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMsg]);

    try {
      // 2. Map history to API expected format (exclude notices/sources/etc)
      const apiHistory: ChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // 3. Send message to backend API
      const response = await sendChatMessage(userText, apiHistory, retrievalMode);

      // 4. Add assistant response
      const newAssistantMsg: UIMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        queryUsed: response.query_used,
        notice: response.notice,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, newAssistantMsg]);
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : 'Something went wrong. Is the backend server running?';
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#080C14] relative">
      {/* Top Navigation Header */}
      <header className="h-20 border-b border-[#1F2937]/50 flex items-center justify-between px-8 bg-[#090D16]/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-[#3B82F6]" />
          <div>
            <h2 className="font-bold text-base text-white tracking-wide">RAG Workspace</h2>
            <p className="text-xs text-gray-500 font-medium">Test retrieval strategies in real-time</p>
          </div>
        </div>

        {/* Retrieval Mode Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-[#111827] border border-[#1F2937]/50 rounded-xl">
          {[
            { id: 'vector', label: 'Vector (Basic)' },
            { id: 'hybrid', label: 'Hybrid (BM25)' },
            { id: 'rerank', label: 'Rerank (Cohere)' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setRetrievalMode(mode.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-300 ${
                retrievalMode === mode.id
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#7C3AED] text-white shadow-md shadow-blue-500/10'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#1F2937]/50'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Messages View */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 scrollbar-thin scrollbar-thumb-gray-800">
        {messages.length === 0 ? (
          /* Empty Chat Splash */
          <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-6">
            <div className="w-16 h-16 bg-gradient-to-tr from-[#3B82F6] to-[#8B5CF6] rounded-2xl flex items-center justify-center shadow-lg shadow-[#3B82F6]/10">
              <Cpu className="w-8 h-8 text-white animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white tracking-wide bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                RAG Knowledge Assistant
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Choose a retrieval mode above and ask any question. The assistant will search the document database, synthesize the sources, and give you an answer.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="p-4 bg-[#111827]/50 border border-[#1F2937]/30 rounded-2xl text-left hover:border-blue-500/30 transition-colors">
                <span className="font-semibold text-xs text-[#3B82F6] block mb-1">Vector Search</span>
                <p className="text-xs text-gray-500">Retrieves context using semantic vector embeddings.</p>
              </div>
              <div className="p-4 bg-[#111827]/50 border border-[#1F2937]/30 rounded-2xl text-left hover:border-purple-500/30 transition-colors">
                <span className="font-semibold text-xs text-[#8B5CF6] block mb-1">Hybrid & Rerank</span>
                <p className="text-xs text-gray-500">Combines keyword BM25 with Vector search, re-ranked by Cohere.</p>
              </div>
            </div>
          </div>
        ) : (
          /* Conversation Messages list */
          <div className="max-w-4xl mx-auto space-y-6 pb-6">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <div key={message.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-2`}>
                  {/* Message Bubble Container */}
                  <div
                    className={`max-w-[85%] rounded-2xl p-4 leading-relaxed text-sm ${
                      isUser
                        ? 'bg-[#1E293B] text-white rounded-tr-none border border-slate-700/50 shadow-md'
                        : 'bg-gradient-to-r from-[#111827] to-[#1E1B4B] text-gray-100 rounded-tl-none border border-[#312E81]/30 shadow-lg'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>

                  {/* AI Metadata & Sources citation drawer */}
                  {!isUser && (
                    <div className="w-full max-w-[85%] space-y-3 pl-2">
                      {/* Notice Banner (e.g. falling back to hybrid) */}
                      {message.notice && (
                        <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 p-2.5 rounded-xl">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{message.notice}</span>
                        </div>
                      )}

                      {/* Standalone search query info */}
                      {message.queryUsed && message.queryUsed !== message.content && (
                        <div className="text-xs text-gray-500 italic flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-[#3B82F6]" />
                          <span>Standalone Query: &quot;{message.queryUsed}&quot;</span>
                        </div>
                      )}

                      {/* Citations Grid */}
                      {message.sources && message.sources.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500 flex items-center gap-1">
                            <Bookmark className="w-3 h-3 text-purple-400" />
                            References
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {message.sources.map((src, idx) => (
                              <div
                                key={idx}
                                className="bg-[#111827]/70 border border-[#1F2937]/50 rounded-xl p-3 hover:border-blue-500/20 hover:bg-[#111827] transition-all duration-300 group shadow-sm flex flex-col justify-between"
                              >
                                <p className="text-xs text-gray-400 line-clamp-2 italic mb-2 leading-relaxed">
                                  &quot;{src.content}&quot;
                                </p>
                                <div className="flex items-center justify-between border-t border-[#1F2937]/35 pt-1.5 mt-auto">
                                  <span className="text-[10px] font-bold text-[#3B82F6] truncate max-w-[70%]">
                                    {src.source}
                                  </span>
                                  <span className="text-[9px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/25">
                                    Chunk #{idx + 1}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* AI Loading bubble */}
            {isLoading && (
              <div className="flex flex-col items-start space-y-2">
                <div className="bg-[#111827] border border-[#1F2937]/50 rounded-2xl rounded-tl-none p-4 shadow-md flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2.5 h-2.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2.5 h-2.5 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            {/* API Error Message */}
            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-sm text-rose-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold">Request Failed</span>
                  <p className="text-xs text-rose-300/80 leading-relaxed">{error}</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Query Input Form Drawer */}
      <footer className="p-6 border-t border-[#1F2937]/50 bg-[#090D16] shrink-0">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-3 items-end">
          {/* New Chat Clean Button */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              title="Clear Conversation"
              className="p-3.5 bg-[#111827] border border-[#1F2937]/50 hover:bg-[#1E293B] text-gray-400 hover:text-white rounded-xl transition-all duration-300 shadow-sm shrink-0 group"
            >
              <Trash2 className="w-5 h-5 group-hover:scale-105 transition-transform" />
            </button>
          )}

          {/* Text Area Input Area */}
          <div className="flex-1 bg-[#111827] border border-[#1F2937]/50 rounded-2xl p-2 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all duration-300 shadow-inner flex items-end">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your uploaded knowledge base..."
              className="flex-1 bg-transparent resize-none outline-none border-none py-2 px-3 text-sm text-gray-100 placeholder-gray-500 max-h-48 overflow-y-auto"
            />
            
            {/* Submit Send Button */}
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className={`p-2.5 rounded-xl transition-all duration-300 shrink-0 ${
                inputValue.trim() && !isLoading
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-md shadow-blue-500/20 hover:scale-105'
                  : 'bg-[#1F2937]/30 text-gray-600 border border-[#1F2937]/50'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
        <div className="max-w-4xl mx-auto flex items-center justify-between mt-2.5 px-3">
          <span className="text-[10px] text-gray-500 font-semibold tracking-wider uppercase">
            Model: GPT-4o
          </span>
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <kbd className="px-1.5 py-0.5 bg-[#1F2937]/50 rounded border border-[#1F2937]/35">Enter</kbd>
            <span>to send,</span>
            <kbd className="px-1.5 py-0.5 bg-[#1F2937]/50 rounded border border-[#1F2937]/35">Shift + Enter</kbd>
            <span>for newline</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
