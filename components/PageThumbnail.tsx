
import React, { useEffect, useRef, useState } from 'react';
import { Page, Stroke } from '../types';
import { renderPDFPageToCanvas } from '../services/pdfService';
import { Trash2, Plus, ArrowDown } from 'lucide-react';

interface PageThumbnailProps {
  page: Page;
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onInsertAfter: (e: React.MouseEvent) => void;
}

const PageThumbnail: React.FC<PageThumbnailProps> = ({ page, pageNumber, isActive, onClick, onDelete, onInsertAfter }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasRenderedPdf, setHasRenderedPdf] = useState(false);

  // Lazy Load Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Pre-load 200px before view
    );
    
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Render PDF Background
  useEffect(() => {
    if (isVisible && page.pdfId && page.pdfPageIndex && !hasRenderedPdf && pdfCanvasRef.current) {
      // 120px width for thumbnail
      renderPDFPageToCanvas(page.pdfId, page.pdfPageIndex, pdfCanvasRef.current, 140, 'fit-width')
        .then(() => setHasRenderedPdf(true));
    }
  }, [isVisible, page.pdfId, page.pdfPageIndex, hasRenderedPdf]);

  // Render Ink (Simplified)
  useEffect(() => {
    if (!isVisible || !inkCanvasRef.current) return;
    
    const ctx = inkCanvasRef.current.getContext('2d');
    if (!ctx) return;
    
    // Setup dimensions
    const width = 140; // Logical width
    const aspectRatio = 1100 / 850; // Default A4 ratio
    const height = width * aspectRatio;
    const dpr = window.devicePixelRatio || 1;
    
    if (inkCanvasRef.current.width !== width * dpr) {
      inkCanvasRef.current.width = width * dpr;
      inkCanvasRef.current.height = height * dpr;
    }
    
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Scale strokes from 850x1100 to 140x(181)
    const scale = width / 850;

    page.strokes.forEach(stroke => {
      if (stroke.points.length < 1) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(1, stroke.width * scale);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(stroke.points[0].x * scale, stroke.points[0].y * scale);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * scale, stroke.points[i].y * scale);
      }
      ctx.stroke();
    });

  }, [isVisible, page.strokes]);

  return (
    <div 
      ref={containerRef}
      onClick={onClick}
      className={`relative group flex-shrink-0 cursor-pointer transition-all duration-200 ${isActive ? 'scale-105' : 'hover:scale-102'}`}
    >
      <div className={`relative w-[140px] aspect-[8.5/11] rounded-xl overflow-hidden border-2 shadow-sm transition-all ${isActive ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-indigo-200' : 'border-slate-200 bg-white hover:border-indigo-200'}`}>
        
        {/* PDF / Template Layer */}
        {page.pdfId ? (
          <canvas ref={pdfCanvasRef} className="absolute inset-0 w-full h-full" />
        ) : (
          <div className="absolute inset-0 bg-white">
            {page.template === 'grid' && <div className="w-full h-full opacity-10" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '10px 10px' }} />}
            {page.template === 'ruled' && <div className="w-full h-full opacity-10" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px)', backgroundSize: '100% 10px' }} />}
          </div>
        )}

        {/* Ink Layer */}
        <canvas ref={inkCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {/* Loading State */}
        {!isVisible && <div className="absolute inset-0 bg-slate-50 animate-pulse" />}
      </div>

      {/* Page Number */}
      <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
        Page {pageNumber}
      </div>

      {/* Hover Actions - Always visible on active page for better UX */}
      <div className={`absolute top-2 right-2 flex flex-col gap-1 transition-opacity z-30 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <button 
          onClick={(e) => { 
            e.preventDefault();
            e.stopPropagation(); 
            onDelete(e); 
          }} 
          className="p-1.5 bg-white text-red-500 rounded-lg shadow-sm border border-slate-100 hover:bg-red-50 transition-colors"
          title="Delete Page"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Add Page Zone (Hover Bottom) */}
      <div className="absolute -bottom-4 left-0 right-0 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none">
         <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onInsertAfter(e); }} className="pointer-events-auto bg-indigo-600 text-white rounded-full p-1 shadow-lg hover:scale-110 transition-transform" title="Insert Page Here">
            <Plus size={12} />
         </button>
      </div>
    </div>
  );
};

export default PageThumbnail;
