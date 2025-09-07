import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Login from './pages/Login';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import ChatPage from './pages/ChatPage';

function App() {
  return (
    <Router>
      <div className="bg-gray-50 min-h-screen">
        {/* <Header /> */}
        <main>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
              <Route path="/chat" element={<ChatPage />} />
            <Route path="/" element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
            </Route>
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App
