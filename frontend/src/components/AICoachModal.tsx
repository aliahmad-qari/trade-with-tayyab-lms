import React, { useState, useEffect, useRef } from "react";
import { apiFetch } from "../lib/api";
import { X, Send, Brain, Bot, User, Sparkles, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "coach";
  text: string;
}

interface AICoachModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
}

export default function AICoachModal({ isOpen, onClose, token }: AICoachModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "coach", text: "Salam! I am Tayyab's Virtual AI Trading Coach. Ask me anything about Forex Smart Money Concepts (SMC), Liquidity, Crypto Scalping, or Risk Management rules!" }
  ]);
  const [inputMsg, setInputMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const samplePrompts = [
    "What is an Order Block (OB)?",
    "Explain standard Risk Management rules",
    "How do sweeps of liquidity work?",
    "Best Bybit crypto scalping indicators"
  ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    
    const userMsg = text.trim();
    setInputMsg("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setIsLoading(true);

    try {
      const response = await apiFetch("/api/ai/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({
          message: userMsg,
          chatHistory: messages.map(m => ({
            role: m.role === "user" ? "user" : "model",
            content: m.text
          }))
        })
      });

      if (!response.ok) throw new Error("HTTP error " + response.status);
      const data = await response.json();
      setMessages(prev => [...prev, { role: "coach", text: data.reply }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        role: "coach",
        text: "💡 It seems there is a connection glitch. Rest assured, proper risk reward ratios (1:2) should keep your account protected! (Double check your Gemini API key in secrets!)"
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([
      { role: "coach", text: "Salam! Chat cleared. Ask me any Forex or Crypto question related to Trade With Tayyab!" }
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans">
      <div className="relative w-full max-w-lg h-[600px] glass-panel rounded-2xl flex flex-col overflow-hidden border border-brand-purple/30 shadow-2xl">
        
        {/* Header decoration */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-brand-purple to-transparent"></div>

        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 bg-brand-card/90 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-brand-purple/25 text-brand-violet rounded-lg glow-dot-purple">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                Tayyab AI Trading Specialist
                <Sparkles className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              </h2>
              <span className="text-[10px] font-mono text-emerald-400 uppercase">Interactive Mentor Mode</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={clearChat}
              className="px-2.5 py-1 text-[10px] uppercase font-semibold text-gray-400 bg-white/5 hover:bg-white/10 rounded-md transition"
            >
              Reset Chat
            </button>
            <button 
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message Panel Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/20">
          {messages.map((msg, idx) => (
            <div 
              key={idx}
              className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar circle */}
              <div className={`p-1.5 rounded-lg shrink-0 ${
                msg.role === "user" 
                  ? "bg-brand-indigo/15 text-brand-indigo" 
                  : "bg-brand-purple/20 text-brand-violet"
              }`}>
                {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Text Bubble */}
              <div className={`text-xs p-3 rounded-xl max-w-[80%] leading-relaxed ${
                msg.role === "user"
                  ? "bg-brand-indigo/20 text-white border border-brand-indigo/30"
                  : "bg-brand-card/90 text-gray-200 border border-white/5"
              }`}>
                {msg.text}
              </div>

            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-lg shrink-0 bg-brand-purple/20 text-brand-violet">
                <Bot className="w-4 h-4" />
              </div>
              <div className="text-xs p-3 rounded-xl bg-brand-card/90 text-gray-400 border border-white/5 flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-brand-purple border-t-transparent rounded-full animate-spin"></span>
                <span>Tayyab Coach is reading the order flow...</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Quick Suggestion Chips */}
        {messages.length === 1 && (
          <div className="p-3 bg-brand-card/30 border-t border-white/5 font-sans">
            <span className="text-[10px] font-bold text-[#8b5cf6]/80 uppercase block mb-1.5">Suggested Topics:</span>
            <div className="grid grid-cols-2 gap-1.5">
              {samplePrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleSend(prompt)}
                  className="p-2 text-left text-[11px] text-gray-300 hover:text-white bg-white/5 hover:bg-brand-purple/10 border border-white/5 hover:border-brand-purple/30 rounded-lg transition text-ellipsis overflow-hidden whitespace-nowrap"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar Area */}
        <form 
          onSubmit={(e) => { e.preventDefault(); handleSend(inputMsg); }}
          className="p-3 bg-brand-card border-t border-white/5 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            placeholder="Ask about liquidity, market structural shifts..."
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-brand-purple/40"
          />
          <button
            type="submit"
            className="p-2.5 bg-brand-purple hover:bg-brand-violet text-white rounded-xl transition cursor-pointer glow-dot-purple"
            disabled={isLoading || !inputMsg.trim()}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
