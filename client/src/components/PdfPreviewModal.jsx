import React from 'react';

const PdfPreviewModal = ({ doc, onClose, openChatModal }) => {
  if (!doc) return null;

  // In a real implementation, you would fetch a temporary URL for the PDF
  // from your backend using doc.s3Path or doc._id and display it in an iframe.
  // For now, we'll show a placeholder.
  const pdfUrl = `/api/documents/view/${doc._id}`; // Example URL
  const s3Url = doc.s3Path.replace(" ", '%20');
  console.log("s3 URL", `https://nrmd-pdf-store.s3.amazonaws.com/${s3Url}`);
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-2xl bg-opacity-50 z-50 flex justify-center items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-800/60 rounded-[24px] shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col border border-neutral-700 text-white p-4"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <header className="flex justify-between items-center pb-4 border-b border-neutral-700/50">
          <h2 className="text-xl font-bold text-neutral-200">{doc.title}</h2>
          <div className="gap-4 flex">
            <button onClick={(e) => {
              openChatModal(e, doc);
              onClose(e);
            }} className="bg-indigo-700/20 border border-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition duration-300">Ask Question</button>
            <button onClick={onClose} className="text-neutral-300 hover:text-white text-2xl">&times;</button>
          </div>
        </header>
        <iframe
          src={`https://nrmd-pdf-store.s3.amazonaws.com/${doc.s3Path}`}
          title={doc.title}
          className="w-full h-full rounded-b-lg mt-4"
          frameBorder="0"
        />

      </div>
    </div>
  );
};

export default PdfPreviewModal;
