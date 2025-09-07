import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BASE_URL } from '../lib/utils';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

const ChatPage = () => {
  const [history, setHistory] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const userInfo = JSON.parse(localStorage.getItem('userInfo'));

  // Fetch chat history
  const fetchHistory = useCallback(async () => {
    try {
      const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
      const { data } = await axios.get(`${BASE_URL}/api/documents/chathistories`, config);
      setHistory(data);
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);
  
  // Load messages when activeChat changes
  useEffect(() => {
    const loadMessages = async () => {
      if (activeChat && activeChat._id) {
        setIsLoading(true);
        try {
          const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
          const { data } = await axios.get(`${BASE_URL}/api/documents/chathistory/${activeChat._id}`, config);
          setMessages(data.messages || []);
        } catch (error) {
          console.error("Failed to load messages:", error);
          setMessages([]);
        } finally {
          setIsLoading(false);
        }
      } else {
        setMessages([]); // Clear messages for a new chat
      }
    };
    loadMessages();
  }, [activeChat, userInfo.token]);

  // Scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let currentChatId = activeChat ? activeChat._id : null;

    try {
      const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
      
      const { data } = await axios.post(
        `${BASE_URL}/api/documents/chat/ask`, 
        { query: input, chatId: currentChatId },
        config
      );

      const botMessage = { sender: 'bot', text: data.response };
      if (!currentChatId && data.chatId) {
        await fetchHistory(); // Refresh history to show the new chat
        setActiveChat({ _id: data.chatId, title: input.substring(0, 40) + '...' });
      }
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      const errorMessage = { sender: 'bot', text: 'Sorry, I ran into an error. Please try again.' };
      setMessages(prev => [...prev, errorMessage]);
      console.error("Chat API error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setActiveChat(null);
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800">
      <div className="container mx-auto h-[calc(100vh-4rem)] flex gap-6">

        {/* Left Sidebar: Chat History */}
        <div className="w-1/3 lg:w-1/4 flex flex-col rounded-[24px] bg-neutral-800/90 p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(0,0,0,0.1)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-neutral-100">History</h2>
            <div className='flex gap-2'>
              
              <Link to="/" className="text-sm text-blue-400 hover:text-blue-300 self-center"> &larr; Dashboard</Link>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto pr-2">
            <button onClick={handleNewChat} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-1 px-3 w-full rounded-lg transition duration-300 flex justify-center items-center mb-2">
                New Chat <span className='font-semibold text-lg px-2'>+</span>
              </button>
            {history.map(chat => (
              <div 
                key={chat._id} 
                className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors ${activeChat?._id === chat._id ? 'bg-neutral-700/80' : 'hover:bg-neutral-700/50'}`}
                onClick={() => setActiveChat(chat)}
              >
                <h3 className="font-semibold text-neutral-200 truncate">{chat.title}</h3>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Chat Window */}
        <div className="w-2/3 lg:w-3/4 flex flex-col rounded-[24px] bg-neutral-800/90 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(0,0,0,0.1)]">
          <>
            <header className="p-4 border-b border-neutral-700/50">
              <h2 className="text-lg font-semibold text-neutral-200 truncate">
                {activeChat ? activeChat.title : 'New Conversation'}
              </h2>
            </header>

            <div className="flex-1 p-4 overflow-y-auto">
              {messages.map((msg, index) => (
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
                  placeholder="Ask a question about your documents..."
                  className="flex-1 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-neutral-200"
                  disabled={isLoading}
                />
                <button type="submit" className="bg-indigo-600 text-white font-bold px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50" disabled={isLoading}>
                  Send
                </button>
              </form>
            </footer>
          </>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
             