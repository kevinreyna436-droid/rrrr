
import React, { useState, useRef, useEffect } from 'react';
import { chatWithExpert } from '../services/geminiService';
import { ChatMessage } from '../types';

const ChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'model', text: 'Hola! Soy tu experto textil. Pregúntame sobre tendencias, códigos de limpieza o proveedores.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('creata_chat_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      } catch (e) {
        console.error("Error parsing chat history", e);
      }
    }
  }, []);

  // Save history on change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('creata_chat_history', JSON.stringify(messages));
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    const result = await chatWithExpert(userMsg.text, history);

    const modelMsg: ChatMessage = { 
      id: (Date.now() + 1).toString(), 
      role: 'model', 
      text: result.text || "No pude encontrar una respuesta.",
      sources: result.sources
    };
    
    setMessages(prev => [...prev, modelMsg]);
    setLoading(false);
  };

  const handleClearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("¿Borrar historial del chat?")) {
      const initial: ChatMessage[] = [{ id: Date.now().toString(), role: 'model', text: 'Historial borrado. ¿En qué puedo ayudarte hoy?' }];
      setMessages(initial);
      localStorage.removeItem('creata_chat_history');
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 bg-primary text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-gray-100 flex flex-col h-[500px] overflow-hidden animate-fade-in-up">
          <div className="bg-primary p-4 text-white flex justify-between items-center">
            <div>
              <h3 className="font-serif text-lg">Asistente Creata</h3>
              <p className="text-xs text-gray-300">Powered by Gemini</p>
            </div>
            <button 
              onClick={handleClearHistory}
              className="text-gray-400 hover:text-white p-1"
              title="Borrar Historial"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-black text-white rounded-br-none' : 'bg-white text-gray-800 shadow-sm rounded-bl-none border border-gray-100'}`}>
                  {msg.text}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-[10px] text-gray-400 mb-1">Fuentes:</p>
                      {msg.sources.map((s, i) => (
                        <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="block text-[10px] text-blue-500 hover:underline truncate">{s.title}</a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-gray-200 p-3 rounded-2xl rounded-bl-none text-xs text-gray-500 animate-pulse">Pensando...</div></div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-gray-100 flex">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Pregunta sobre telas..."
              className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
            />
            <button onClick={handleSend} className="ml-2 bg-black text-white p-2 rounded-full hover:bg-gray-800 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatBot;
