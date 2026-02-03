
import * as pdfjsLib from 'pdfjs-dist';

// Define the PDF.js version and Worker URL
const PDFJS_VERSION = '4.10.38';
const WORKER_SRC = `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

// In-memory cache for loaded PDF documents. 
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
 */
export const loadPDFDocument = async (file: File) => {
  initWorker();
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // @ts-ignore
    const lib = pdfjsLib.default || pdfjsLib;
    
    const loadingTask = lib.getDocument({
      data: arrayBuffer,
      cMapUrl: `https://esm.sh/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
      cMapPacked: true,
    });

    const pdfDoc = await loadingTask.promise;
    const pdfId = `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
 * supports both high-res main view rendering and low-res thumbnail rendering.
 */
export const renderPDFPageToCanvas = async (
  pdfId: string,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scaleOrWidth: number = 1.0, 
  mode: 'scale' | 'fit-width' = 'scale'
) => {
  const pdfDoc = pdfCache.get(pdfId);
  if (!pdfDoc) {
    // If cache is missing (reload), we might fail gracefully or return empty
    return;
  }

  try {
    const page = await pdfDoc.getPage(pageIndex);
    const unscaledViewport = page.getViewport({ scale: 1 });
    
    let finalScale = 1;

    if (mode === 'fit-width') {
      // Scale to fit a specific pixel width (e.g., 850px for main, 150px for thumb)
      // We take devicePixelRatio into account for sharpness
      const dpr = window.devicePixelRatio || 1;
      finalScale = (scaleOrWidth / unscaledViewport.width) * dpr;
    } else {
      // Just apply the zoom multiplier relative to 72dpi? 
      // Actually, for NoteOn main view, we treat 'scale=1' as fitting 850px width logic
      const dpr = window.devicePixelRatio || 1;
      const baseScale = (850 / unscaledViewport.width);
      finalScale = baseScale * scaleOrWidth * dpr;
    }

    const viewport = page.getViewport({ scale: finalScale });

    // Ensure canvas matches the viewport dimensions
    if (canvas.width !== viewport.width || canvas.height !== viewport.height) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
    }
    
    const context = canvas.getContext('2d');
    if (!context) return;
    
    // Clear previous render
    context.clearRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
    };

    // If a render task is already running on this canvas, we might want to cancel it
    // But for simplicity in this version, we just await.
    await page.render(renderContext).promise;
    
    // @ts-ignore
    if (page.cleanup) page.cleanup();
    
  } catch (error) {
    console.error(`Error rendering page ${pageIndex}:`, error);
  }
};

export const getPDFPageAspectRatio = async (pdfId: string, pageIndex: number): Promise<number> => {
   const pdfDoc = pdfCache.get(pdfId);
   if (!pdfDoc) return 0.77; 
   try {
     const page = await pdfDoc.getPage(pageIndex);
     const viewport = page.getViewport({ scale: 1.0 });
     return viewport.width / viewport.height;
   } catch {
     return 0.77;
   }
};
