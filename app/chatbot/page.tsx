"use client";
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

export default function ChatbotPage() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Hello! I am your AI fitness coach. How can I help?' }
  ]);
  const [input, setInput] = useState('');

  const send = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    const res = await fetch('/api/chatbot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: input }) });
    const data = await res.json();
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-3xl font-bold">AI Coach Chat</h1>
      <div className="h-[60vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-2xl p-4 space-y-3">
        {messages.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`p-3 rounded-xl max-w-[80%] ${m.role === 'user' ? 'bg-brand-500 text-white ml-auto' : 'bg-gray-200 dark:bg-gray-700'}`}
          >
            {m.content}
          </motion.div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          className="flex-1 p-3 rounded-xl border dark:bg-gray-800 dark:border-gray-700" placeholder="Ask about workouts, nutrition..." />
        <button onClick={send} className="p-3 bg-brand-500 text-white rounded-xl"><Send size={20} /></button>
      </div>
    </div>
  );
}