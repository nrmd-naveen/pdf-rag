import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { BASE_URL } from '../lib/utils';
import Toast from '../components/Toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [toast, setToast] = useState({ message: '', type: '' });
  const [loginSuccess, setLoginSuccess] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Display toast message passed from other pages (e.g., logout)
    if (location.state?.message) {
      setToast({ message: location.state.message, type: location.state.type });
      navigate(location.pathname, { replace: true }); // Clear state after showing
    }
  }, [location, navigate]);

  useEffect(() => {
    if (loginSuccess) {
      const timer = setTimeout(() => {
        navigate('/');
      }, 1000); // Delay navigation to allow toast to be seen
      return () => clearTimeout(timer);
    }
  }, [loginSuccess, navigate]);

  const submitHandler = async (e) => {
    e.preventDefault();
    setToast({ message: '', type: '' });
    try {
      const { data } = await axios.post(`${BASE_URL}/api/auth/login`, { email, password });
      localStorage.setItem('userInfo', JSON.stringify(data));
      setToast({ message: 'Login successful!', type: 'success' });
      setLoginSuccess(true);
    } catch (err) {
      setToast({ message: err.response?.data?.message || 'Login failed', type: 'error' });
      console.error('Login failed', err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800">
      <div className="max-w-md w-full space-y-8 bg-neutral-800/90 p-8 rounded-[24px] shadow-2xl border border-neutral-700">
        {toast.message && <Toast message={toast.message} type={toast.type} onClear={() => setToast({ message: '', type: '' })} />}
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-neutral-100">Sign in to your account</h2>
        </div>
        <form onSubmit={submitHandler} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input id="email-address" name="email" type="email" required className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-neutral-200 placeholder-neutral-500" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input id="password" name="password" type="password" required className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-neutral-200 placeholder-neutral-500" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div>
            <button type="submit" className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-800 focus:ring-indigo-500 transition-all duration-300">
              Sign in
            </button>
          </div>
          <div className="text-sm text-center">
            <Link to="/register" className="font-medium text-indigo-400 hover:text-indigo-300">
              Don't have an account? Sign up
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;