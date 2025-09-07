import React, { useState, useRef, useEffect, use } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

const ChatModal = ({ doc, onClose }) => {
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);  

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    console.log("messages ----------", messages);
  }, [messages]);
  
  useEffect(() => {
    const fetchChatHistory = async () => {
      setIsLoading(true);
      try {
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
        // This is a new endpoint we'll need to create
        const { data } = await axios.get(`${BASE_URL}/api/documents/${doc._id}/chathistory`, config);
        if (data) {
          console.log("data ----------", data);
          setMessages(data[0].messages || []);
          setChatId(data._id);
        }
      } catch (error) {
        if (error.response && error.response.status !== 404) {
          console.error("Error fetching chat history:", error);
        }
        // 404 is fine, it just means no history exists yet.
      } finally {
        setIsLoading(false);
      }
    };
    fetchChatHistory();
  }, [doc._id]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const userInfo = JSON.parse(localStorage.getItem('userInfo'));
      const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
      
      const { data } = await axios.post(
        `${BASE_URL}/api/documents/${doc._id}/chat`,
        { query: input, chatId: chatId },
        config
      );

      const botMessage = { sender: 'bot', text: data.response };
      if (data.chatId && !chatId) setChatId(data.chatId);
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage = { sender: 'bot', text: 'Sorry, I ran into an error. Please try again.' };
      setMessages(prev => [...prev, errorMessage]);
      console.error("Chat API error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-neutral-800/90 rounded-[24px] shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col border border-neutral-700 text-white">
        <header className="p-4 border-b border-neutral-700/50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-neutral-200 truncate pr-4">Chat with: {doc.title}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-2xl leading-none">&times;</button>
        </header>

        <div className="flex-1 p-4 overflow-y-auto">
          {messages?.length === 0 && !isLoading && (
            <div className="flex justify-center items-center h-full">
              <div className="text-center text-neutral-400">
                <p>No messages yet.</p><p>Start the conversation!</p>
              </div>
            </div>
          )}
          {messages?.map((msg, index) => (
            <div key={index} className={`flex mb-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`rounded-lg px-4 py-2 max-w-xl whitespace-pre-wrap ${msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-neutral-700 text-neutral-200'}`}
              >
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>

            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-lg px-4 py-2 bg-neutral-700 text-neutral-200">
                <span className="animate-pulse">...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <footer className="p-4 border-t border-neutral-700/50">
          <form onSubmit={handleSendMessage} className="flex gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about this document..."
              className="flex-1 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-neutral-200"
              disabled={isLoading}
            />
            <button type="submit" className="bg-indigo-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50" disabled={isLoading}>
              Send
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
};

export default ChatModal;
