import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BASE_URL } from '../lib/utils';
import ChatModal from '../components/ChatModal';

const Dashboard = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('keyword'); // 'keyword' or 'semantic'
  const [isUploading, setIsUploading] = useState(false);

  const [selectedDoc, setSelectedDoc] = useState(null);

  const navigate = useNavigate();
  const userInfo = JSON.parse(localStorage.getItem('userInfo'));

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${userInfo.token}`,
        },
      };

      let response;
      if (searchType === 'semantic' && searchTerm.trim() !== '') {
        response = await axios.post(BASE_URL + '/api/documents/semantic-search', { query: searchTerm }, config);
      } else {
        response = await axios.get(`${BASE_URL}/api/documents?text=${searchTerm}`, config);
      }
      setDocuments(response.data);
    } catch (err) {
      setError('Failed to fetch documents.');
      if (err.response?.status === 401) {
        localStorage.removeItem('userInfo');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [userInfo.token, navigate, searchTerm, searchType]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchDocuments();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    setError('');

    try {
      const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };

      // 1. Get pre-signed URL
      const { data: { url, key } } = await axios.get(`${BASE_URL}/api/documents/upload-url?filename=${file.name}`, config);

      // 2. Upload to S3
      await axios.put(url, file, { headers: { 'Content-Type': 'application/pdf' } });

      // 3. Create document record in backend
      await axios.post(`${BASE_URL}/api/documents`, { title: file.name.replace('.pdf', ''), s3Path: key }, config);

      // Refresh documents
      await fetchDocuments();
    } catch (err) {
      setError('File upload failed. Please try again.');
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      try {
        const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
        await axios.delete(`${BASE_URL}/api/documents/${id}`, config);
        setDocuments(documents.filter(doc => doc._id !== id));
      } catch (err) {
        setError('Failed to delete document.');
      }
    }
  };

  return (
    <>
    {selectedDoc && <ChatModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />}
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">My Documents</h1>
        <label className={`bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer transition duration-300 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
          {isUploading ? 'Uploading...' : 'Upload PDF'}
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
        </label>
      </div>

      {/* Search and Filter Bar */}
      <div className="mb-8 bg-white p-4 rounded-lg shadow">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-grow">
            <input
              type="text"
              placeholder={searchType === 'keyword' ? "Search by title..." : "Ask a question about your documents..."}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-4">
            <select value={searchType} onChange={(e) => setSearchType(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none">
              <option value="keyword">Keyword</option>
              <option value="semantic">Semantic</option>
            </select>
            <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Search</button>
          </div>
        </form>
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}

      {/* Document Grid */}
      {loading ? (
        <div className="text-center py-10">
          <p className="text-gray-500">Loading documents...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-lg shadow">
          <h3 className="text-xl font-semibold text-gray-700">No documents found.</h3>
          <p className="text-gray-500 mt-2">Upload your first PDF to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((doc) => (
            <div key={doc._id} className="bg-white rounded-lg shadow-lg overflow-hidden flex flex-col justify-between transition-transform transform hover:-translate-y-1 cursor-pointer"
                 onClick={() => setSelectedDoc(doc)}
            >
              <div className="p-6 flex-grow">
                <h2 className="text-xl font-bold text-gray-800 mb-2 truncate">{doc.title}</h2>
                <p className="text-gray-600 text-sm mb-4 h-16 overflow-hidden">{doc.summary}</p>
                <div className="flex flex-wrap gap-2">
                  {doc.tags.slice(0, 3).map((tag, index) => (
                    <span key={index} className="bg-gray-200 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-3 flex justify-between items-center">
                <p className="text-xs text-gray-500">Created by: {doc.createdBy.email}</p>
                <button onClick={() => handleDelete(doc._id)} className="text-red-500 hover:text-red-700 text-sm font-semibold">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
};

export default Dashboard;