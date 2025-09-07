import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.entry';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const generateThumbnailBase64 = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const scale = 1.5;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context, viewport }).promise;

  // Convert canvas to base64 PNG
  return canvas.toDataURL('image/png');
};


const base64ToBlob = (base64Data, contentType = 'image/png') => {
  const byteCharacters = atob(base64Data.split(',')[1]);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length).fill().map((_, i) => slice.charCodeAt(i));
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
};


const uploadThumbnailToS3 = async (thumbnailBlob, filename) => {
  // Get presigned upload URL from your backend
  const res = await fetch(`/api/upload-thumbnail-url?filename=${filename}`);
  const { url, key } = await res.json();

  await fetch(url, {
    method: 'PUT',
    body: thumbnailBlob,
    headers: {
      'Content-Type': 'image/png',
    },
  });

  return key; // Save this as thumbnailPath
};
