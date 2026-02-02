
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Stroke, Point, ToolType, TextElement, ImageElement } from '../types';

interface DrawingCanvasProps {
  currentTool: ToolType;
  color: string;
  strokes: Stroke[];
  textElements: TextElement[];
  imageElements: ImageElement[];
  setStrokes: (data: { strokes?: Stroke[]; textElements?: TextElement[]; imageElements?: ImageElement[] }) => void;
  template: 'blank' | 'ruled' | 'grid';
}

export interface CanvasHandle {
  getCanvasImage: () => string;
  clear: () => void;
}

type InteractionMode = 'none' | 'drawing' | 'lassoing' | 'moving' | 'resizing';
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | null;

const DrawingCanvas = forwardRef<CanvasHandle, DrawingCanvasProps>(({ 
  currentTool, 
  color, 
  strokes, 
  textElements,
  imageElements = [],
  setStrokes,
  template 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle>(null);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [lassoPolygon, setLassoPolygon] = useState<Point[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [dragStart, setDragStart] = useState<Point | null>(null);

  // Cache for loaded images
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  useImperativeHandle(ref, () => ({
    getCanvasImage: () => {
      if (!canvasRef.current) return '';
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvasRef.current.width;
      tempCanvas.height = canvasRef.current.height;
      const tCtx = tempCanvas.getContext('2d');
      if (tCtx) {
        tCtx.fillStyle = '#ffffff';
        tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tCtx.drawImage(canvasRef.current, 0, 0);
      }
      return tempCanvas.toDataURL('image/png');
    },
    clear: () => {
      setStrokes({ strokes: [], textElements: [], imageElements: [] });
      setSelectedElementIds([]);
      setCurrentStroke([]);
      setLassoPolygon([]);
    }
  }));

  const getBoundingBox = (points: Point[]) => {
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    return { minX, minY, maxX, maxY };
  };

  const selectionRect = useMemo(() => {
    if (selectedElementIds.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedElementIds.forEach(id => {
      const stroke = strokes.find(s => s.id === id);
      if (stroke) {
        minX = Math.min(minX, stroke.boundingBox.minX);
        minY = Math.min(minY, stroke.boundingBox.minY);
        maxX = Math.max(maxX, stroke.boundingBox.maxX);
        maxY = Math.max(maxY, stroke.boundingBox.maxY);
      }
      const te = textElements.find(t => t.id === id);
      if (te && canvasRef.current) {
        const tx = (te.x / 100) * canvasRef.current.width;
        const ty = (te.y / 100) * canvasRef.current.height;
        const width = te.text.length * (te.fontSize * 0.6);
        minX = Math.min(minX, tx);
        minY = Math.min(minY, ty - te.fontSize / 2);
        maxX = Math.max(maxX, tx + width);
        maxY = Math.max(maxY, ty + te.fontSize / 2);
      }
      const img = imageElements.find(i => i.id === id);
      if (img && canvasRef.current) {
        const ix = (img.x / 100) * canvasRef.current.width;
        const iy = (img.y / 100) * canvasRef.current.height;
        const iw = (img.width / 100) * canvasRef.current.width;
        const ih = (img.height / 100) * canvasRef.current.height;
        minX = Math.min(minX, ix);
        minY = Math.min(minY, iy);
        maxX = Math.max(maxX, ix + iw);
        maxY = Math.max(maxY, iy + ih);
      }
    });

    if (minX === Infinity) return null;
    return { x: minX - 10, y: minY - 10, w: maxX - minX + 20, h: maxY - minY + 20 };
  }, [selectedElementIds, strokes, textElements, imageElements]);

  const drawTemplate = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (template === 'blank') return;
    ctx.save();
    if (template === 'ruled') {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let y = 60; y < height; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      ctx.strokeStyle = '#fecaca';
      ctx.beginPath(); ctx.moveTo(80, 0); ctx.lineTo(80, height); ctx.stroke();
    } else if (template === 'grid') {
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    }
    ctx.restore();
  };

  const render = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTemplate(ctx, canvas.width, canvas.height);

    // Draw Images
    for (const img of imageElements) {
      const x = (img.x / 100) * canvas.width;
      const y = (img.y / 100) * canvas.height;
      const w = (img.width / 100) * canvas.width;
      const h = (img.height / 100) * canvas.height;

      let htmlImg = imageCache.current.get(img.dataUrl);
      if (!htmlImg) {
        htmlImg = new Image();
        htmlImg.src = img.dataUrl;
        imageCache.current.set(img.dataUrl, htmlImg);
        htmlImg.onload = () => render(); // Re-render when image is loaded
      }

      if (htmlImg.complete) {
        ctx.save();
        if (selectedElementIds.includes(img.id)) {
          ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(79, 70, 229, 0.4)';
        }
        ctx.drawImage(htmlImg, x, y, w, h);
        ctx.restore();
      }
    }

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    strokes.forEach(s => {
      if (!s.points || s.points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      
      if (selectedElementIds.includes(s.id)) {
        ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(79, 70, 229, 0.4)';
      }

      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke(); ctx.restore();
    });

    textElements.forEach(te => {
      ctx.save();
      ctx.globalAlpha = 1; ctx.fillStyle = te.color; ctx.textBaseline = 'middle';
      ctx.font = `italic ${te.fontSize}px 'Kalam', cursive`;
      const x = (te.x / 100) * canvas.width;
      const y = (te.y / 100) * canvas.height;
      if (selectedElementIds.includes(te.id)) {
        ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(79, 70, 229, 0.4)';
      }
      ctx.fillText(te.text, x, y); ctx.restore();
    });

    if (currentStroke.length > 1) {
      ctx.save(); ctx.beginPath(); ctx.strokeStyle = color; 
      ctx.lineWidth = currentTool === 'highlighter' ? 25 : 2.5;
      ctx.globalAlpha = currentTool === 'highlighter' ? 0.3 : 1;
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      ctx.stroke(); ctx.restore();
    }

    if (lassoPolygon.length > 1) {
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(lassoPolygon[0].x, lassoPolygon[0].y);
      for (let i = 1; i < lassoPolygon.length; i++) ctx.lineTo(lassoPolygon[i].x, lassoPolygon[i].y);
      ctx.stroke(); ctx.fillStyle = 'rgba(79, 70, 229, 0.05)'; ctx.fill(); ctx.restore();
    }

    if (selectionRect) {
      ctx.save();
      ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
      
      // Draw resize handles if at least one image is selected and ONLY images are selected for simplicity of resize logic
      const onlyImagesSelected = selectedElementIds.every(id => imageElements.some(img => img.id === id));
      if (onlyImagesSelected && selectedElementIds.length > 0) {
        ctx.setLineDash([]);
        ctx.fillStyle = '#4f46e5';
        const handleSize = 8;
        // Corners
        ctx.fillRect(selectionRect.x - handleSize/2, selectionRect.y - handleSize/2, handleSize, handleSize); // nw
        ctx.fillRect(selectionRect.x + selectionRect.w - handleSize/2, selectionRect.y - handleSize/2, handleSize, handleSize); // ne
        ctx.fillRect(selectionRect.x - handleSize/2, selectionRect.y + selectionRect.h - handleSize/2, handleSize, handleSize); // sw
        ctx.fillRect(selectionRect.x + selectionRect.w - handleSize/2, selectionRect.y + selectionRect.h - handleSize/2, handleSize, handleSize); // se
      }
      ctx.restore();
    }
  };

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && canvasRef.current) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          canvasRef.current.width = width;
          canvasRef.current.height = height;
          render();
        }
      }
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    render();
  }, [strokes, textElements, imageElements, template, currentStroke, lassoPolygon, selectedElementIds, selectionRect]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const cy = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const p = getCoords(e);
    setDragStart(p);

    if (selectionRect) {
      const handleSize = 15;
      const { x, y, w, h } = selectionRect;
      
      // Check for resize handles
      if (selectedElementIds.every(id => imageElements.some(img => img.id === id))) {
        if (Math.hypot(p.x - x, p.y - y) < handleSize) { setInteractionMode('resizing'); setActiveResizeHandle('nw'); return; }
        if (Math.hypot(p.x - (x+w), p.y - y) < handleSize) { setInteractionMode('resizing'); setActiveResizeHandle('ne'); return; }
        if (Math.hypot(p.x - x, p.y - (y+h)) < handleSize) { setInteractionMode('resizing'); setActiveResizeHandle('sw'); return; }
        if (Math.hypot(p.x - (x+w), p.y - (y+h)) < handleSize) { setInteractionMode('resizing'); setActiveResizeHandle('se'); return; }
      }

      // Check for move
      if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) { 
        setInteractionMode('moving'); 
        return; 
      }
    }

    if (currentTool === 'eraser') {
      setInteractionMode('drawing');
    } else if (currentTool === 'lasso' || currentTool === 'select') {
      setInteractionMode('lassoing'); setLassoPolygon([p]); setSelectedElementIds([]);
    } else {
      setInteractionMode('drawing'); setCurrentStroke([p]); setSelectedElementIds([]);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (interactionMode === 'none') return;
    const p = getCoords(e);
    const canvas = canvasRef.current!;
    const dx = p.x - (dragStart?.x || p.x);
    const dy = p.y - (dragStart?.y || p.y);

    if (interactionMode === 'moving' && selectionRect) {
      const updatedStrokes = strokes.map(s => {
        if (!selectedElementIds.includes(s.id)) return s;
        const nP = s.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
        return { ...s, points: nP, boundingBox: getBoundingBox(nP) };
      });
      const updatedText = textElements.map(te => {
        if (!selectedElementIds.includes(te.id)) return te;
        return { ...te, x: te.x + (dx / canvas.width) * 100, y: te.y + (dy / canvas.height) * 100 };
      });
      const updatedImages = imageElements.map(img => {
        if (!selectedElementIds.includes(img.id)) return img;
        return { ...img, x: img.x + (dx / canvas.width) * 100, y: img.y + (dy / canvas.height) * 100 };
      });
      setStrokes({ strokes: updatedStrokes, textElements: updatedText, imageElements: updatedImages });
      setDragStart(p);
    } else if (interactionMode === 'resizing' && activeResizeHandle) {
      const updatedImages = imageElements.map(img => {
        if (!selectedElementIds.includes(img.id)) return img;
        
        let newX = img.x;
        let newY = img.y;
        let newW = img.width;
        let newH = img.height;

        const pdx = (dx / canvas.width) * 100;
        const pdy = (dy / canvas.height) * 100;

        switch (activeResizeHandle) {
          case 'nw': newX += pdx; newY += pdy; newW -= pdx; newH -= pdy; break;
          case 'ne': newY += pdy; newW += pdx; newH -= pdy; break;
          case 'sw': newX += pdx; newW -= pdx; newH += pdy; break;
          case 'se': newW += pdx; newH += pdy; break;
        }

        // Constraints
        if (newW < 2) newW = 2;
        if (newH < 2) newH = 2;

        return { ...img, x: newX, y: newY, width: newW, height: newH };
      });
      setStrokes({ imageElements: updatedImages });
      setDragStart(p);
    } else if (interactionMode === 'drawing') {
      if (currentTool === 'eraser') {
        const remainingStrokes = strokes.filter(s => {
          const inBox = p.x >= s.boundingBox.minX - 15 && p.x <= s.boundingBox.maxX + 15 && p.y >= s.boundingBox.minY - 15 && p.y <= s.boundingBox.maxY + 15;
          if (!inBox) return true;
          return !s.points.some(pt => Math.hypot(pt.x - p.x, pt.y - p.y) < 20);
        });
        const remainingText = textElements.filter(te => {
          const tx = (te.x / 100) * canvas.width, ty = (te.y / 100) * canvas.height;
          return !(p.x >= tx && p.x <= tx + (te.text.length * te.fontSize * 0.6) && p.y >= ty - 15 && p.y <= ty + 15);
        });
        const remainingImages = imageElements.filter(img => {
          const ix = (img.x / 100) * canvas.width;
          const iy = (img.y / 100) * canvas.height;
          const iw = (img.width / 100) * canvas.width;
          const ih = (img.height / 100) * canvas.height;
          return !(p.x >= ix && p.x <= ix + iw && p.y >= iy && p.y <= iy + ih);
        });
        setStrokes({ strokes: remainingStrokes, textElements: remainingText, imageElements: remainingImages });
      } else {
        setCurrentStroke(prev => [...prev, p]);
      }
    } else if (interactionMode === 'lassoing') {
      setLassoPolygon(prev => [...prev, p]);
    }
  };

  const handlePointerUp = () => {
    if (interactionMode === 'lassoing' && lassoPolygon.length > 3) {
      const sIds: string[] = [];
      const isInside = (point: Point, vs: Point[]) => {
        let x = point.x, y = point.y, inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
          let xi = vs[i].x, yi = vs[i].y, xj = vs[j].x, yj = vs[j].y;
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
      };
      strokes.forEach(s => { if (s.points.some(pt => isInside(pt, lassoPolygon))) sIds.push(s.id); });
      textElements.forEach(te => {
        const x = (te.x / 100) * canvasRef.current!.width, y = (te.y / 100) * canvasRef.current!.height;
        if (isInside({ x, y }, lassoPolygon)) sIds.push(te.id);
      });
      imageElements.forEach(img => {
        const x = (img.x / 100) * canvasRef.current!.width, y = (img.y / 100) * canvasRef.current!.height;
        const w = (img.width / 100) * canvasRef.current!.width, h = (img.height / 100) * canvasRef.current!.height;
        // Check corners of image
        if (isInside({x,y}, lassoPolygon) || isInside({x:x+w, y}, lassoPolygon) || isInside({x, y:y+h}, lassoPolygon) || isInside({x:x+w, y:y+h}, lassoPolygon)) {
          sIds.push(img.id);
        }
      });
      setSelectedElementIds(sIds);
      setLassoPolygon([]);
    } else if (interactionMode === 'drawing' && currentStroke.length > 1) {
      setStrokes({ strokes: [...strokes, { id: Date.now().toString(), points: currentStroke, color, width: currentTool === 'highlighter' ? 25 : 2.5, opacity: currentTool === 'highlighter' ? 0.3 : 1, tool: currentTool, boundingBox: getBoundingBox(currentStroke) }] });
      setCurrentStroke([]);
    }
    setInteractionMode('none'); 
    setDragStart(null);
    setActiveResizeHandle(null);
  };

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none cursor-crosshair bg-transparent"
        onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
      />
    </div>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;
