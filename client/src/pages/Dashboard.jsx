import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { BASE_URL } from '../lib/utils';
import PdfPreviewModal from '../components/PdfPreviewModal';
import ChatModal from '../components/ChatModal';
import SearchComponent from '../components/SearchComponent';
import { useMemo } from 'react';

const Dashboard = () => {
  const [allDocuments, setAllDocuments] = useState([]); // Stores all docs from API
  const [filteredDocuments, setFilteredDocuments] = useState([]); // Docs to display
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('semantic');
  const [activeTags, setActiveTags] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [chatDoc, setChatDoc] = useState(null);

  const userInfo = JSON.parse(localStorage.getItem('userInfo'));

  const logoutHandler = () => {
    localStorage.removeItem('userInfo');
    navigate('/login');
  };
  const navigate = useNavigate();

  const fetchAllDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${userInfo.token}`,
        },
      };

      const response = await axios.get(`${BASE_URL}/api/documents`, config);
      setAllDocuments(response.data);
    } catch (err) {
      setError('Failed to fetch documents.');
      if (err.response?.status === 401) {
        localStorage.removeItem('userInfo');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [userInfo.token, navigate]);

  useEffect(() => {
    fetchAllDocuments();
  }, [fetchAllDocuments]);

  // This effect handles all filtering logic
  useEffect(() => {
    console.log("searchType", searchType);
    let documentsToDisplay = [...allDocuments];
    if (searchType === 'all' && activeTags.length > 0) {
      documentsToDisplay = documentsToDisplay.filter(doc =>
        activeTags.some(activeTag => doc.tags.includes(activeTag))
      );
    }
    // Semantic search results will overwrite the list, so no special filtering needed here.
    setFilteredDocuments(documentsToDisplay);
  }, [allDocuments, activeTags, searchType]);

  useEffect(() => {
    // This is a good spot for debugging, but can be removed for production.
    // console.log(activeTags)
  }, [activeTags])

  const handleSearch = async (query, type) => {
    setSearchType(type); // Set the search type to correctly trigger the filtering effect
    if (type === 'semantic' && query.trim()) {
      setLoading(true);
      setError('');
      try {
        const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
        const response = await axios.post(`${BASE_URL}/api/documents/semantic-search`, { query }, config);
        setFilteredDocuments(response.data); // Directly set results from semantic search
      } catch (err) {
        setError('Semantic search failed.');
      } finally {
        setLoading(false);
      }
    } else {
      // If search is cleared or it's not a semantic search, reset to all documents
      setFilteredDocuments(allDocuments);
    }
  };

  const handleTagFilter = (tags) => {
    setActiveTags(tags);
    // console.log("activeTags", activeTags);

    // The filtering logic is now in the useEffect hook
    // which depends on `activeTags`.
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
      const { data: document } = await axios.post(
        `${BASE_URL}/api/documents`,
        { title: file.name.replace('.pdf', ''), s3Path: key },
        config
      );

      // 4. Start polling in the background (don't await it)
      pollForThumbnail(document._id, config);

      // 5. Refresh documents list immediately
      await fetchAllDocuments();
    } catch (err) {
      setError('File upload failed. Please try again.');
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };
  
  const allAvailableTags = useMemo(() => [...new Set(allDocuments.flatMap(doc => doc.tags))], [allDocuments]);


  const pollForThumbnail = async (documentId, config, maxAttempts = 30, interval = 1000) => {
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const { data } = await axios.get(`${BASE_URL}/api/documents/poll-thumbnail/${documentId}`, config);

        if (data.thumbnailUrl) {
          setAllDocuments(prevDocs => 
            prevDocs.map(doc => doc._id === documentId ? { ...doc, thumbnailUrl: data.thumbnailUrl } : doc)
          );
          console.log('✅ Thumbnail is ready:', data.thumbnailUrl);
          return;
        }

      } catch (err) {
        console.error('Error during thumbnail polling:', err);
      }

      // Wait before the next attempt
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }

    console.warn('⏰ Thumbnail not ready after 30 seconds.');
  };


  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      try {
        const config = { headers: { Authorization: `Bearer ${userInfo.token}` } };
        await axios.delete(`${BASE_URL}/api/documents/${id}`, config);
        setAllDocuments(allDocuments.filter(doc => doc._id !== id));
      } catch (err) {
        setError('Failed to delete document.');
      }
    }
  };

  const handleDeleteClick = (e, id) => {
    e.stopPropagation(); // Prevent card's onClick from firing
    handleDelete(id);
  };

  const handleChatClick = (e, doc) => {
    e.stopPropagation(); // Prevent card's onClick from firing
    setChatDoc(doc);
  };

  return (
    <>
    {chatDoc && <ChatModal doc={chatDoc} onClose={() => setChatDoc(null)} />}
    {selectedDoc && <PdfPreviewModal doc={selectedDoc} onClose={() => setSelectedDoc(null)} />}
    <div className="min-h-screen bg-neutral-900 text-white p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800">
      <div className="container mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-100">My Documents</h1>
          <div className="flex items-center gap-4">
            <Link to="/chat" className="border border-green-600 bg-green-800/20 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">
              Ask Question
            </Link>
            <label className={`relative bg-indigo-700/20 border border-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer transition duration-300 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isUploading ? 'Uploading...' : 'Upload PDF'}
              <input type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              
            </label>
                {userInfo && (
                  <button onClick={logoutHandler} className="border border-red-500 bg-red-700/20 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Logout</button>
                )}
          </div>
      </div>

      {/* Search and Filter Bar */}
      <SearchComponent onSearch={handleSearch} onTagFilter={handleTagFilter} allTags={allAvailableTags} isSearching={loading} />

        {error && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">{error}</div>}

      {/* Document Grid */}
      {loading ? (
          <div className="text-center py-10">
            <p className="text-neutral-400">Loading documents...</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-16 bg-neutral-800/30 rounded-xl border border-neutral-700">
            <h3 className="text-2xl font-semibold text-neutral-200">No documents found.</h3>
            <p className="text-neutral-400 mt-2">{allDocuments.length > 0 ? 'Try adjusting your search or filter.' : 'Upload your first PDF to get started!'}</p>
        </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredDocuments.map((doc) => (
              <div key={doc._id} className="group rounded-[24px] bg-neutral-800/90 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(0,0,0,0.1),0_2px_2px_0_rgba(0,0,0,0.1),0_4px_4px_0_rgba(0,0,0,0.1),0_8px_8px_0_rgba(0,0,0,0.1)] p-3 transition-all duration-300 hover:bg-neutral-800/80 hover:-translate-y-1 cursor-pointer flex flex-col"
                 onClick={() => setSelectedDoc(doc)}
            >
                {/* Thumbnail Placeholder */}
                <div className="relative w-full h-40 mb-4 rounded-[16px] bg-neutral-700/50 flex items-center justify-center shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(0,0,0,0.1)]">
                  
                {
                  doc.thumbnailUrl ? (
                    <img
                      src={doc.thumbnailUrl}
                      alt="Document Thumbnail"
                      className="w-full h-full object-cover rounded-[16px] object-top"
                    />
                  ) : (
                    <div className="animate-pulse w-full h-full rounded-[16px] bg-neutral-800/80 flex items-center justify-center shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_0_1px_rgba(0,0,0,0.1)]">
                      {/* Optional: Icon or spinner */}
                      <div className=" bg-neutral-300 rounded-md" />
                    </div>
                  )
                }

                </div>

                <div className="flex flex-col flex-grow justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-200 mb-2 truncate" title={doc.title}>{doc.title}</h2>
                    <p className="text-neutral-400 text-sm mb-4 h-16 overflow-hidden">{doc.summary || 'No summary available.'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                  {doc.tags.slice(0, 3).map((tag, index) => (
                      <span key={index} className="bg-neutral-700 text-neutral-300 text-xs font-semibold px-2.5 py-1 rounded-full">{tag}</span>
                  ))}
                </div>
                </div>

                <div className="border-t border-neutral-700/50 pt-3 flex justify-between items-center">
                  <p className="text-xs text-neutral-500 truncate" title={doc.createdBy.email}>By: {doc.createdBy.email}</p>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button onClick={(e) => handleChatClick(e, doc)} className="bg-transparent border hover:bg-sky-500/10 px-2 py-1 rounded-full w-16 text-sky-400 hover:text-sky-300 text-xs font-semibold">
                      Chat
                    </button>
                    <button onClick={(e) => handleDeleteClick(e, doc._id)} className="bg-transparent border hover:bg-red-400/10 px-2 py-1 rounded-full w-16 text-red-500 hover:text-red-400 text-xs font-semibold">
                      Delete
                    </button>
                  </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
    </>
  );
};

export default Dashboard;