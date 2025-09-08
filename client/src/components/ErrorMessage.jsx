import { useState, useEffect } from 'react';

function ErrorMessage({ rateLimitError }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (rateLimitError) {
      setFadeOut(false);
    } else {
      setTimeout(() => setFadeOut(true), 3000); // Wait for 3 seconds before fading out
    }
  }, [rateLimitError]);

  return (
    rateLimitError && (
      <div
        className={`z-[50] backdrop-blur-2xl fixed top-5 right-5 bg-yellow-800/20 border border-yellow-600 text-yellow-200 px-6 py-3 rounded-lg shadow-lg transition-opacity duration-1000 ${
          fadeOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <span className="font-bold">Heads up!</span>
        <p>{rateLimitError}</p>
      </div>
    )
  );
}
export default ErrorMessage;