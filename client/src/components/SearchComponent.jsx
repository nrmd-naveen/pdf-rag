import React, { useState, useMemo, useEffect } from 'react';

const Pill = ({ text, onClick }) => (
  <span
    onClick={onClick}
    className="flex items-center justify-center h-7 text-sm bg-neutral-700 border border-neutral-600 px-3 rounded-full cursor-pointer hover:bg-neutral-600 transition-colors"
  >
    {text}
    <span className="ml-2 font-bold text-neutral-400 hover:text-white">×</span>
  </span>
);

const SearchComponent = ({ onSearch, onTagFilter, allTags, isSearching }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('semantic'); // 'tags' or 'semantic'
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // When the user changes search type, clear the state
  const handleSearchTypeChange = (e) => {
    const newType = e.target.value;
    setSearchType(newType);
    setSearchTerm('');
    setSelectedTags([]);
    if (newType === 'tags') {
      onTagFilter([]); // Clear tag filter in parent
    } else {
      onSearch('', 'all'); // Reset to show all documents
    }
  };

  useEffect(() => {
    // Propagate tag changes to the parent component for filtering
    if (searchType === 'tags') {
      onTagFilter(selectedTags);
    }
  }, [selectedTags, searchType, onTagFilter]);

  const filteredSuggestions = useMemo(() => {
    if (!searchTerm) return [];
    return allTags.filter(
      (tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedTags.includes(tag)
    );
  }, [searchTerm, allTags, selectedTags]);

  const handleKeyDown = (e) => {
    if (searchType !== 'tags' || e.key !== 'Enter' || !e.target.value.trim()) return;
    e.preventDefault();
    const newTag = e.target.value.trim();
    addTag(newTag);
  };

  const addTag = (tag) => {
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
    setSearchTerm(''); // Clear input after adding tag
  };

  const removeTag = (tagToRemove) => {
    setSelectedTags(selectedTags.filter((tag) => tag !== tagToRemove));
  };

  const handleSearch = (e) => {
    e.preventDefault();
    // Tag search is now handled via onTagFilter in real-time.
    // This form submission is only for semantic search.
    if (searchType === 'semantic') {
      onSearch(searchTerm, 'semantic');
    } else {
      // For tag search, hitting search button can be a no-op or clear, up to UX design.
      // Here we do nothing as filtering is live.
    }
  };

  const getPlaceholder = () => {
    if (searchType === 'tags') {
      return "Type a tag and press Enter...";
    }
    return "Ask a question about your documents...";
  };

  return (
    <div className="mb-10 bg-neutral-800/50 p-4 rounded-xl shadow-lg border border-neutral-700">
      <form onSubmit={handleSearch} className="flex flex-col gap-4">
        <div className="flex-grow">
          <div className="flex items-center gap-4 relative">
            <select
              value={searchType}
              onChange={handleSearchTypeChange}
              className="px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:outline-none text-neutral-200"
            >
              <option value="semantic">Semantic</option>
              <option value="tags">Tags</option>
            </select>
            <div className="w-full relative">
              <input
                type="text"
                placeholder={getPlaceholder()}
                className="w-full pl-4 pr-12 py-2 bg-neutral-900 border border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-neutral-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setTimeout(() => setIsInputFocused(false), 150)} // Delay to allow click on suggestion
                disabled={isSearching && searchType === 'semantic'}
              />
              {searchType === 'tags' && isInputFocused && filteredSuggestions.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {filteredSuggestions.map((tag) => (
                    <li
                      key={tag}
                      onMouseDown={() => addTag(tag)} // use onMouseDown to fire before onBlur
                      className="px-4 py-2 cursor-pointer hover:bg-neutral-700 text-neutral-300"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {searchType === 'semantic' && (
            <div className="flex justify-end">
                <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition duration-300 disabled:bg-blue-800 disabled:cursor-not-allowed"
                disabled={isSearching || !searchTerm.trim()}
                >
                {isSearching ? 'Searching...' : 'Search'}
                </button>
            </div>
            )}
          </div>
        </div>

        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-4 border-t border-neutral-700/50">
            {selectedTags.map((tag) => (
              <Pill key={tag} text={tag} onClick={() => removeTag(tag)} />
            ))}
          </div>
        )}

      </form>
    </div>
  );
};

export default SearchComponent;