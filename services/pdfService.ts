
import * as pdfjsLib from 'pdfjs-dist';

// Define the PDF.js version and Worker URL
const PDFJS_VERSION = '4.10.38';
const WORKER_SRC = `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

// In-memory cache for loaded PDF documents. 
// In a real production app, this might be backed by IndexedDB.
const pdfCache = new Map<string, any>();

let isWorkerInitialized = false;

const initWorker = () => {
  if (isWorkerInitialized) return;

  try {
    // @ts-ignore
    const lib = pdfjsLib.default || pdfjsLib;

    if (lib) {
      if (!lib.GlobalWorkerOptions) {
        lib.GlobalWorkerOptions = {};
      }
      lib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
      isWorkerInitialized = true;
    }
  } catch (e) {
    console.warn("Error initializing PDF worker:", e);
  }
};

/**
 * Loads a PDF file into memory and returns metadata + a session ID.
 * Does NOT render pages to images immediately.
 */
export const loadPDFDocument = async (file: File) => {
  initWorker();
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // @ts-ignore
    const lib = pdfjsLib.default || pdfjsLib;
    
    // Load the document proxy
    const loadingTask = lib.getDocument({
      data: arrayBuffer,
      cMapUrl: `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
      cMapPacked: true,
    });

    const pdfDoc = await loadingTask.promise;
    
    // Generate a unique ID for this session
    const pdfId = `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store in cache
    pdfCache.set(pdfId, pdfDoc);

    return {
      pdfId,
      numPages: pdfDoc.numPages,
      title: file.name.replace('.pdf', '')
    };
  } catch (error) {
    console.error("Failed to load PDF document:", error);
    throw new Error("Could not parse PDF file.");
  }
};

/**
 * Renders a specific page of a PDF onto a canvas context.
 * This is efficient and allows for crisp zooming.
 */
export const renderPDFPageToCanvas = async (
  pdfId: string,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.0 // This is the zoom level
) => {
  const pdfDoc = pdfCache.get(pdfId);
  if (!pdfDoc) {
    console.warn(`PDF Document ${pdfId} not found in cache.`);
    return;
  }

  try {
    const page = await pdfDoc.getPage(pageIndex);
    
    // We want the PDF page to fit roughly within our logical width (850px)
    // But we also want to respect the user's zoom level.
    // First, get the unscaled viewport to know native dimensions
    const unscaledViewport = page.getViewport({ scale: 1 });
    
    // Calculate a base scale to fit width (optional, depends on design)
    // For NoteOn, let's assume we want to map PDF points to our logical 850px width if it's A4
    // or just render it at a high enough DPI.
    
    // High DPI rendering scale (2x for retina) * Zoom Scale
    const pixelRatio = window.devicePixelRatio || 1;
    const finalScale = scale * pixelRatio * (850 / unscaledViewport.width); 

    const viewport = page.getViewport({ scale: finalScale });

    // Match canvas dimensions to the viewport
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    // Style width/height should match the logical size for CSS layout
    // but here we just ensure the internal bitmap is high quality.
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    // Clear previous render
    context.clearRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    await page.render(renderContext).promise;
    
    // Cleanup if needed (v4 might handle this automatically)
    // @ts-ignore
    if (page.cleanup) page.cleanup();
    
  } catch (error) {
    console.error(`Error rendering page ${pageIndex}:`, error);
  }
};

export const getPDFPageAspectRatio = async (pdfId: string, pageIndex: number): Promise<number> => {
   const pdfDoc = pdfCache.get(pdfId);
   if (!pdfDoc) return 0.77; // Default A4
   try {
     const page = await pdfDoc.getPage(pageIndex);
     const viewport = page.getViewport({ scale: 1.0 });
     return viewport.width / viewport.height;
   } catch {
     return 0.77;
   }
};
