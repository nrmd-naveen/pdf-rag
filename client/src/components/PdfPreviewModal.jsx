import React from 'react';

const PdfPreviewModal = ({ doc, onClose }) => {
  if (!doc) return null;

  // In a real implementation, you would fetch a temporary URL for the PDF
  // from your backend using doc.s3Path or doc._id and display it in an iframe.
  // For now, we'll show a placeholder.
  const pdfUrl = `/api/documents/view/${doc._id}`; // Example URL
  const s3Url = doc.s3Path.replace(" ", '%20');
  console.log("s3 URL", `https://nrmd-pdf-store.s3.amazonaws.com/${s3Url}`);
  return (
    <div
      className="fixed inset-0 bg-black/80 bg-opacity-70 z-50 flex justify-center items-center"
      onClick={onClose}
    >
      <div
        className="bg-neutral-800 rounded-lg shadow-xl w-8/12 h-11/12 flex flex-col p-4"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-neutral-200">{doc.title}</h2>
          <button onClick={onClose} className="text-neutral-300 hover:text-white text-2xl">&times;</button>
        </div>
        {/* <div className="flex-grow bg-neutral-900 rounded-md p-2">
        </div> */}
        <iframe
          src={`https://nrmd-pdf-store.s3.amazonaws.com/${doc.s3Path}`}
          title={doc.title}
          className="w-full h-full rounded"
          frameBorder="0"
        />

      </div>
    </div>
  );
};

export default PdfPreviewModal;
