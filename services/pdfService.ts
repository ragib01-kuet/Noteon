
import * as pdfjsLib from 'pdfjs-dist';

// Configure worker safely
try {
  // @ts-ignore
  if (pdfjsLib.GlobalWorkerOptions) {
    // @ts-ignore
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  } else if (pdfjsLib.default && pdfjsLib.default.GlobalWorkerOptions) {
    // Handle case where default export wraps the library
    pdfjsLib.default.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  }
} catch (e) {
  console.warn("Failed to set PDF worker source", e);
}

interface PDFPageImage {
  dataUrl: string;
  width: number;
  height: number;
  aspectRatio: number;
}

export const convertPDFToImages = async (file: File): Promise<PDFPageImage[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Access getDocument correctly depending on import structure
    const getDocument = pdfjsLib.getDocument || (pdfjsLib.default && pdfjsLib.default.getDocument);
    
    if (!getDocument) throw new Error("PDF.js getDocument not found");

    const loadingTask = getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const pages: PDFPageImage[] = [];
    const scale = 2.0; // Render at 2x scale for high quality on retina displays

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      
      pages.push({
        dataUrl: canvas.toDataURL('image/png'),
        width: viewport.width,
        height: viewport.height,
        aspectRatio: viewport.width / viewport.height
      });
    }

    return pages;
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw new Error('Failed to process PDF file');
  }
};
