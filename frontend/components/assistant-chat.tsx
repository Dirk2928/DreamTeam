"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, MessageCircle, RotateCcw, Send, Sparkles, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Card, Textarea } from "./ui";

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
}

const greeting: ChatTurn = {
  id: "greeting",
  role: "assistant",
  content: "Hi! I’m the PKonek assistant powered by Lumen. Ask me anything, or I can help you write and understand a community report.",
};

const suggestions = [
  "Help me write a clear complaint",
  "How does complaint verification work?",
  "What should I do in an emergency?",
];

export function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([greeting]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, busy]);

  async function send(value = message) {
    const text = value.trim();
    if (text.length < 2 || busy) return;
    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: "user", content: text };
    setTurns((current) => [...current, userTurn]);
    setMessage("");
    setBusy(true);
    try {
      const result = await api.assistant.chat(text);
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: result.response },
      ]);
    } catch (error) {
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "I couldn’t answer that. Please try again.",
          failed: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    const lastUser = [...turns].reverse().find((turn) => turn.role === "user");
    if (lastUser) void send(lastUser.content);
  }

  function resetChat() {
    setTurns([greeting]);
    setMessage("");
  }

  return (
    <div className="fixed bottom-5 right-5 z-[600]">
      {open && (
        <Card className="mb-3 flex h-[min(650px,calc(100vh-7rem))] w-[min(430px,calc(100vw-2rem))] flex-col overflow-hidden shadow-2xl">
          <header className="flex items-center justify-between border-b bg-gradient-to-r from-[#0c2723] to-teal-800 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <span className="relative grid size-10 place-items-center rounded-xl bg-teal-400 text-[#0c2723]">
                <Bot size={21} />
                <i className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-teal-800 bg-emerald-300" />
              </span>
              <div>
                <div className="font-bold">PKonek AI</div>
                <div className="text-[11px] text-teal-100">Powered by Lumen · ready to help</div>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={resetChat} className="rounded-lg p-2 text-teal-100 hover:bg-white/10" aria-label="Clear chat" title="Clear chat">
                <RotateCcw size={16} />
              </button>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-teal-100 hover:bg-white/10" aria-label="Close assistant">
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4">
            {turns.map((turn) => (
              <div key={turn.id} className={`flex gap-2.5 ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
                {turn.role === "assistant" && (
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-teal-100 text-teal-700"><Sparkles size={15} /></span>
                )}
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-6 shadow-sm ${
                  turn.role === "user"
                    ? "rounded-br-md bg-teal-700 text-white"
                    : turn.failed
                      ? "rounded-bl-md border border-rose-200 bg-rose-50 text-rose-800"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-700"
                }`}>
                  <p className="whitespace-pre-wrap">{turn.content}</p>
                  {turn.failed && (
                    <button onClick={retry} className="mt-2 text-xs font-bold underline">Try again</button>
                  )}
                </div>
                {turn.role === "user" && (
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600"><UserRound size={15} /></span>
                )}
              </div>
            ))}
            {turns.length === 1 && (
              <div className="flex flex-wrap gap-2 pl-10">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} onClick={() => void send(suggestion)} className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-teal-800 hover:bg-teal-50">
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {busy && (
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-full bg-teal-100 text-teal-700"><Bot size={15} /></span>
                <div className="flex gap-1 rounded-2xl rounded-bl-md border bg-white px-4 py-3">
                  {[0, 1, 2].map((item) => <i key={item} className="size-1.5 animate-bounce rounded-full bg-teal-500" style={{ animationDelay: `${item * 120}ms` }} />)}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t bg-white p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-teal-400 focus-within:ring-4 focus-within:ring-teal-500/10">
              <Textarea
                className="max-h-32 min-h-11 resize-none border-0 bg-transparent py-2 shadow-none focus:ring-0"
                rows={1}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Message PKonek AI…"
                maxLength={4000}
              />
              <Button className="size-10 shrink-0 rounded-xl p-0" disabled={busy || message.trim().length < 2} onClick={() => void send()} aria-label="Send message">
                {busy ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
              </Button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">AI can make mistakes. Verify urgent information; call 911 for emergencies.</p>
          </div>
        </Card>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="ml-auto grid size-14 place-items-center rounded-full bg-teal-700 text-white shadow-xl shadow-teal-950/20 transition hover:scale-105 hover:bg-teal-800"
        aria-label="Open PKonek AI assistant"
      >
        {open ? <X /> : <MessageCircle />}
      </button>
    </div>
  );
}
