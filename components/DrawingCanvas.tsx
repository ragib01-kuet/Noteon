
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Stroke, Point, ToolType, TextElement } from '../types';

interface DrawingCanvasProps {
  currentTool: ToolType;
  color: string;
  strokes: Stroke[];
  textElements: TextElement[];
  setStrokes: (data: { strokes: Stroke[]; textElements: TextElement[] }) => void;
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
  setStrokes,
  template 
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [lassoPolygon, setLassoPolygon] = useState<Point[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null);

  useImperativeHandle(ref, () => ({
    getCanvasImage: () => {
      return canvasRef.current?.toDataURL('image/png') || '';
    },
    clear: () => {
      setStrokes({ strokes: [], textElements: [] });
      setSelectedElementIds([]);
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
    });

    if (minX === Infinity) return null;
    return { x: minX - 10, y: minY - 10, w: maxX - minX + 20, h: maxY - minY + 20 };
  }, [selectedElementIds, strokes, textElements]);

  const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (template === 'ruled') {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let y = 50; y < height; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    } else if (template === 'grid') {
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      const step = 30;
      for (let x = 0; x < width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    }
    ctx.restore();
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(ctx, canvas.width, canvas.height);

    strokes.forEach(s => {
      if (!s.points || s.points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.globalAlpha = s.opacity;
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
      if (selectedElementIds.includes(s.id)) {
        ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(79, 70, 229, 0.4)';
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
        ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(79, 70, 229, 0.4)';
      }
      ctx.fillText(te.text, x, y); ctx.restore();
    });

    if (currentStroke.length > 1) {
      ctx.save(); ctx.beginPath(); ctx.strokeStyle = color; 
      ctx.lineWidth = currentTool === 'highlighter' ? 25 : 2.5;
      ctx.globalAlpha = currentTool === 'highlighter' ? 0.3 : 1;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
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
      ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
      ctx.fillStyle = '#4f46e5'; ctx.setLineDash([]);
      const handles = [
        { x: selectionRect.x, y: selectionRect.y }, 
        { x: selectionRect.x + selectionRect.w, y: selectionRect.y },
        { x: selectionRect.x, y: selectionRect.y + selectionRect.h }, 
        { x: selectionRect.x + selectionRect.w, y: selectionRect.y + selectionRect.h }
      ];
      handles.forEach(h => {
        ctx.beginPath(); ctx.arc(h.x, h.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
      });
      ctx.restore();
    }
  };

  // Initialize and Resize logic
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        render();
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { render(); }, [strokes, textElements, template, currentStroke, lassoPolygon, selectedElementIds, selectionRect]);

  const isPointInStroke = (p: Point, s: Stroke) => {
    if (p.x < s.boundingBox.minX - 10 || p.x > s.boundingBox.maxX + 10 ||
        p.y < s.boundingBox.minY - 10 || p.y > s.boundingBox.maxY + 10) return false;
    for (let i = 0; i < s.points.length; i++) {
      const dist = Math.sqrt(Math.pow(p.x - s.points[i].x, 2) + Math.pow(p.y - s.points[i].y, 2));
      if (dist < Math.max(s.width, 10)) return true;
    }
    return false;
  };

  const isPointInText = (p: Point, te: TextElement, canvas: HTMLCanvasElement) => {
    const tx = (te.x / 100) * canvas.width;
    const ty = (te.y / 100) * canvas.height;
    const width = te.text.length * (te.fontSize * 0.6);
    return p.x >= tx && p.x <= tx + width && p.y >= ty - te.fontSize / 2 && p.y <= ty + te.fontSize / 2;
  };

  const isPointInPolygon = (point: Point, vs: Point[]) => {
    let x = point.x, y = point.y, inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y, xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
  };

  const getCoords = (e: React.MouseEvent | React.TouchEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const cy = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  };

  const getHandleAt = (p: Point): ResizeHandle => {
    if (!selectionRect) return null;
    const { x, y, w, h } = selectionRect;
    const threshold = 20;
    if (Math.hypot(p.x - x, p.y - y) < threshold) return 'nw';
    if (Math.hypot(p.x - (x + w), p.y - y) < threshold) return 'ne';
    if (Math.hypot(p.x - x, p.y - (y + h)) < threshold) return 'sw';
    if (Math.hypot(p.x - (x + w), p.y - (y + h)) < threshold) return 'se';
    return null;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const p = getCoords(e);
    setDragStart(p);

    if (selectionRect) {
      const handle = getHandleAt(p);
      if (handle) {
        setInteractionMode('resizing');
        setActiveHandle(handle);
        return;
      }
      if (p.x >= selectionRect.x && p.x <= selectionRect.x + selectionRect.w &&
          p.y >= selectionRect.y && p.y <= selectionRect.y + selectionRect.h) {
        setInteractionMode('moving');
        return;
      }
    }

    if (currentTool === 'eraser') {
      const remainingStrokes = strokes.filter(s => !isPointInStroke(p, s));
      const remainingText = textElements.filter(te => !isPointInText(p, te, canvasRef.current!));
      if (remainingStrokes.length !== strokes.length || remainingText.length !== textElements.length) {
        setStrokes({ strokes: remainingStrokes, textElements: remainingText });
      }
      setInteractionMode('drawing');
    } else if (currentTool === 'lasso') {
      setInteractionMode('lassoing');
      setLassoPolygon([p]);
      setSelectedElementIds([]);
    } else if (currentTool === 'pen' || currentTool === 'pencil' || currentTool === 'highlighter') {
      setInteractionMode('drawing');
      setCurrentStroke([p]);
      setSelectedElementIds([]);
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
        const newPoints = s.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
        return { ...s, points: newPoints, boundingBox: getBoundingBox(newPoints) };
      });
      const updatedText = textElements.map(te => {
        if (!selectedElementIds.includes(te.id)) return te;
        return { ...te, x: te.x + (dx / canvas.width) * 100, y: te.y + (dy / canvas.height) * 100 };
      });
      setStrokes({ strokes: updatedStrokes, textElements: updatedText });
      setDragStart(p);
    } else if (interactionMode === 'resizing' && selectionRect && dragStart) {
      const centerX = selectionRect.x + selectionRect.w / 2;
      const centerY = selectionRect.y + selectionRect.h / 2;
      const oldDist = Math.hypot(dragStart.x - centerX, dragStart.y - centerY);
      const newDist = Math.hypot(p.x - centerX, p.y - centerY);
      const factor = newDist / (oldDist || 1);

      const updatedStrokes = strokes.map(s => {
        if (!selectedElementIds.includes(s.id)) return s;
        const newPoints = s.points.map(pt => ({
          x: centerX + (pt.x - centerX) * factor,
          y: centerY + (pt.y - centerY) * factor
        }));
        return { ...s, points: newPoints, boundingBox: getBoundingBox(newPoints) };
      });
      const updatedText = textElements.map(te => {
        if (!selectedElementIds.includes(te.id)) return te;
        return { ...te, fontSize: Math.max(6, te.fontSize * factor) };
      });
      setStrokes({ strokes: updatedStrokes, textElements: updatedText });
      setDragStart(p);
    } else if (interactionMode === 'drawing') {
      if (currentTool === 'eraser') {
        const remainingStrokes = strokes.filter(s => !isPointInStroke(p, s));
        const remainingText = textElements.filter(te => !isPointInText(p, te, canvasRef.current!));
        if (remainingStrokes.length !== strokes.length || remainingText.length !== textElements.length) {
          setStrokes({ strokes: remainingStrokes, textElements: remainingText });
        }
      } else {
        setCurrentStroke(prev => [...prev, p]);
      }
    } else if (interactionMode === 'lassoing') {
      setLassoPolygon(prev => [...prev, p]);
    }
  };

  const handlePointerUp = () => {
    if (interactionMode === 'none') return;

    if (interactionMode === 'lassoing') {
      if (lassoPolygon.length > 3) {
        const selectedIds: string[] = [];
        strokes.forEach(s => { if (s.points.some(pt => isPointInPolygon(pt, lassoPolygon))) selectedIds.push(s.id); });
        textElements.forEach(te => {
          const x = (te.x / 100) * canvasRef.current!.width;
          const y = (te.y / 100) * canvasRef.current!.height;
          if (isPointInPolygon({ x, y }, lassoPolygon)) selectedIds.push(te.id);
        });
        setSelectedElementIds(selectedIds);
      }
      setLassoPolygon([]);
    } else if (interactionMode === 'drawing' && currentStroke.length > 1) {
      const newStroke: Stroke = {
        id: Date.now().toString(), 
        points: currentStroke, 
        color, 
        width: currentTool === 'highlighter' ? 25 : 2.5,
        opacity: currentTool === 'highlighter' ? 0.3 : 1, 
        tool: currentTool,
        boundingBox: getBoundingBox(currentStroke)
      };
      setStrokes({ strokes: [...strokes, newStroke], textElements });
      setCurrentStroke([]);
    }

    setInteractionMode('none');
    setDragStart(null);
    setActiveHandle(null);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full group">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-crosshair bg-white"
        onMouseDown={handlePointerDown} 
        onMouseMove={handlePointerMove} 
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown} 
        onTouchMove={handlePointerMove} 
        onTouchEnd={handlePointerUp}
      />
      {selectedElementIds.length > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2 bg-white/95 backdrop-blur-md p-2 rounded-2xl shadow-2xl border border-indigo-100 z-50 animate-in fade-in zoom-in duration-200">
          <button onClick={() => {
            setStrokes({
              strokes: strokes.filter(s => !selectedElementIds.includes(s.id)),
              textElements: textElements.filter(te => !selectedElementIds.includes(te.id))
            });
            setSelectedElementIds([]);
          }} className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors flex items-center gap-2 text-xs font-black uppercase tracking-widest">
            Delete Selection
          </button>
          <button onClick={() => setSelectedElementIds([])} className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-colors text-xs font-black uppercase tracking-widest">
            Done
          </button>
        </div>
      )}
    </div>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';
export default DrawingCanvas;
