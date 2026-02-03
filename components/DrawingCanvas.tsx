
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Stroke, Point, ToolType, BrushType, TextElement, ImageElement } from '../types';
import { detectShapeGeometric, hitTestResizeHandles, getResizeHandleRects, resizeStrokePoints, getBoundingBox as calcBoundingBox, isPointInPolygon, BoundingBox, ResizeHandleType } from '../services/geometryService';
import { renderPDFPageToCanvas } from '../services/pdfService';

interface DrawingCanvasProps {
  currentTool: ToolType;
  brushType: BrushType;
  color: string;
  strokeSize: number;
  strokes: Stroke[];
  textElements: TextElement[];
  imageElements: ImageElement[];
  backgroundUrl?: string;
  setStrokes: (data: { strokes?: Stroke[]; textElements?: TextElement[]; imageElements?: ImageElement[] }) => void;
  template: 'blank' | 'ruled' | 'grid';
  zoomScale?: number;
  smartShapesEnabled?: boolean;
  pdfId?: string;
  pdfPageIndex?: number;
}

export interface CanvasHandle {
  getCanvasImage: () => string;
  clear: () => void;
}

type InteractionMode = 'none' | 'drawing' | 'lassoing' | 'moving' | 'resizing' | 'erasing';

const LOGICAL_WIDTH = 850;
const LOGICAL_HEIGHT = 1100;
const SHAPE_DETECTION_DEBOUNCE_MS = 600;

const dist = (p1: Point, p2: Point) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

// Simple stroke hit test
const isPointNearStroke = (p: Point, s: Stroke, tol: number): boolean => {
  // Bounding box pre-check for performance
  if (p.x < s.boundingBox.minX - tol || p.x > s.boundingBox.maxX + tol || 
      p.y < s.boundingBox.minY - tol || p.y > s.boundingBox.maxY + tol) {
    return false;
  }

  for (let i = 0; i < s.points.length - 1; i++) {
    const p1 = s.points[i], p2 = s.points[i+1], l2 = dist(p1, p2) ** 2;
    if (l2 === 0) { if (dist(p, p1) < tol) return true; continue; }
    let t = ((p.x - p1.x) * (p2.x - p1.x) + (p.y - p1.y) * (p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    if (dist(p, { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) }) < tol + s.width / 2) return true;
  }
  return false;
};

// Helper to get bounds for text (using canvas context for measurement)
const getTextBounds = (t: TextElement, ctx: CanvasRenderingContext2D): BoundingBox => {
    ctx.save();
    ctx.font = `bold ${t.fontSize}px 'Kalam', cursive`;
    const m = ctx.measureText(t.text);
    ctx.restore();
    return {
        minX: t.x,
        maxX: t.x + m.width,
        minY: t.y - t.fontSize/2, // Approximate middle baseline
        maxY: t.y + t.fontSize/2,
        width: m.width,
        height: t.fontSize
    };
};

const drawTexturedPath = (ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number, opacity: number, brush: BrushType) => {
  if (points.length < 1) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (brush === 'felt-tip') { ctx.lineCap = 'square'; ctx.shadowBlur = width / 4; ctx.shadowColor = color; }
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
};

const DrawingCanvas = forwardRef<CanvasHandle, DrawingCanvasProps>(({ 
  currentTool, brushType, color, strokeSize, strokes, textElements, imageElements, setStrokes, template, zoomScale = 1.0, smartShapesEnabled = false, backgroundUrl, pdfId, pdfPageIndex
}, ref) => {
  // We use TWO canvases now. One for the static background (PDF/Image) and one for active Ink.
  // This prevents redrawing the heavy PDF on every mouse move.
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Interaction State
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('none');
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [lassoPolygon, setLassoPolygon] = useState<Point[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<HTMLImageElement | null>(null);
  
  // Local manipulation state (avoids full app re-renders during drag)
  const [tempStrokes, setTempStrokes] = useState<Stroke[] | null>(null);
  const [tempTextElements, setTempTextElements] = useState<TextElement[] | null>(null);

  // Resize State
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandleType | null>(null);
  const [resizeSnapshot, setResizeSnapshot] = useState<{
    originalBounds: BoundingBox;
    originalStrokes: Stroke[]; 
    originalText: TextElement[];
  } | null>(null);

  // Smart Shape State
  const pendingStrokeIdsRef = useRef<Set<string>>(new Set());
  const shapeDetectionTimeoutRef = useRef<number | null>(null);

  const dpr = window.devicePixelRatio || 1;

  useImperativeHandle(ref, () => ({
    getCanvasImage: () => {
      // Composition for export
      const inkCanvas = inkCanvasRef.current;
      const bgCanvas = bgCanvasRef.current;
      if (!inkCanvas || !bgCanvas) return '';

      const temp = document.createElement('canvas');
      temp.width = LOGICAL_WIDTH * dpr; temp.height = LOGICAL_HEIGHT * dpr;
      const tCtx = temp.getContext('2d');
      if (tCtx) { 
        // 1. Draw Background
        tCtx.fillStyle = '#ffffff'; 
        tCtx.fillRect(0, 0, temp.width, temp.height);
        
        // 2. Draw PDF/Template layer (scaled to fit)
        tCtx.drawImage(bgCanvas, 0, 0, temp.width, temp.height);
        
        // 3. Draw Ink layer
        tCtx.drawImage(inkCanvas, 0, 0, temp.width, temp.height);
      }
      return temp.toDataURL('image/png');
    },
    clear: () => setStrokes({ strokes: [], textElements: [], imageElements: [] })
  }));

  // --- Background Loading (PDF or Image) ---
  useEffect(() => {
    if (backgroundUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = backgroundUrl;
      img.onload = () => setBackgroundImage(img);
    } else {
      setBackgroundImage(null);
    }
  }, [backgroundUrl]);

  // --- Background Rendering (Layer 0) ---
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set resolution
    if (canvas.width !== LOGICAL_WIDTH * dpr || canvas.height !== LOGICAL_HEIGHT * dpr) {
      canvas.width = LOGICAL_WIDTH * dpr;
      canvas.height = LOGICAL_HEIGHT * dpr;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    // If PDF, render page
    if (pdfId && pdfPageIndex) {
      // renderPDFPageToCanvas handles its own context scaling logic internally for quality,
      // but we need to ensure it draws into OUR buffer.
      renderPDFPageToCanvas(pdfId, pdfPageIndex, canvas, zoomScale).then(() => {
        // PDF Render complete
      });
    } 
    // If Image
    else if (backgroundImage) {
      ctx.scale(dpr, dpr);
      ctx.drawImage(backgroundImage, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.restore();
    } 
    // If Template
    else {
      ctx.scale(dpr, dpr);
      if (template !== 'blank') {
        ctx.strokeStyle = template === 'ruled' ? '#e2e8f0' : '#f1f5f9'; ctx.lineWidth = 1;
        const step = 40;
        for (let x = 0; x < LOGICAL_WIDTH; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LOGICAL_HEIGHT); ctx.stroke(); }
        for (let y = 0; y < LOGICAL_HEIGHT; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LOGICAL_WIDTH, y); ctx.stroke(); }
      }
      ctx.restore();
    }
    
  }, [pdfId, pdfPageIndex, backgroundImage, template, zoomScale, dpr]);

  // Derived state for rendering: Use temp arrays if dragging/manipulating
  const activeStrokes = useMemo(() => tempStrokes || strokes, [tempStrokes, strokes]);
  const activeTextElements = useMemo(() => tempTextElements || textElements, [tempTextElements, textElements]);

  // Calculate Selection Rect (includes both strokes and text)
  const selectionRect = useMemo(() => {
    if (selectedElementIds.length === 0) return null;
    
    const selectedPoints = activeStrokes
      .filter(s => selectedElementIds.includes(s.id))
      .flatMap(s => s.points);

    const selectedText = activeTextElements.filter(t => selectedElementIds.includes(t.id));
    
    // If we need context for text measurement, we might be slightly inaccurate here without it.
    // However, text dragging usually updates position which is cheap.
    // For bounds calculation, we can assume approximate bounds or use a temporary canvas if needed.
    // Let's use the actual canvas context in render loop for accurate drawing, 
    // but here we might need a rough estimate or access the ref.
    // Hack: We'll skip complex text measurement here and rely on render loop or use basic estimation.
    
    let points = [...selectedPoints];
    
    // Add text corners to points cloud
    if (inkCanvasRef.current) {
        const ctx = inkCanvasRef.current.getContext('2d');
        if (ctx) {
            selectedText.forEach(t => {
                const b = getTextBounds(t, ctx);
                points.push({x: b.minX, y: b.minY});
                points.push({x: b.maxX, y: b.maxY});
            });
        }
    }

    if (points.length === 0) return null;
    return calcBoundingBox(points);
  }, [selectedElementIds, activeStrokes, activeTextElements]);

  // --- Ink Rendering (Layer 1) ---
  const renderInk = () => {
    const canvas = inkCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== LOGICAL_WIDTH * dpr || canvas.height !== LOGICAL_HEIGHT * dpr) {
      canvas.width = LOGICAL_WIDTH * dpr;
      canvas.height = LOGICAL_HEIGHT * dpr;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); 
    ctx.scale(dpr, dpr);

    // 1. Render Strokes
    activeStrokes.forEach(s => {
      ctx.save();
      if (selectedElementIds.includes(s.id)) { ctx.shadowBlur = 4; ctx.shadowColor = 'rgba(79, 70, 229, 0.4)'; }
      if (s.isCorrected) { ctx.shadowBlur = 8; ctx.shadowColor = s.color + '60'; }
      drawTexturedPath(ctx, s.points, s.color, s.width, s.opacity, s.brushType || 'solid');
      ctx.restore();
    });

    // 2. Render Text
    activeTextElements.forEach(t => {
       ctx.save();
       ctx.font = `bold ${t.fontSize}px 'Kalam', cursive`;
       ctx.fillStyle = t.color;
       ctx.textBaseline = 'middle';
       ctx.textAlign = 'left';
       if (selectedElementIds.includes(t.id)) {
           ctx.shadowColor = 'rgba(79, 70, 229, 0.5)';
           ctx.shadowBlur = 8;
       }
       ctx.fillText(t.text, t.x, t.y);
       ctx.restore();
    });

    // 3. Render Current Drawing Stroke
    if (currentStroke.length > 1) {
      if (currentTool === 'eraser') {
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(currentStroke[currentStroke.length-1].x, currentStroke[currentStroke.length-1].y, strokeSize, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        drawTexturedPath(ctx, currentStroke, color, strokeSize, currentTool === 'highlighter' ? 0.4 : 1.0, brushType);
      }
    }

    // 4. Render Selection UI
    if (selectionRect && currentTool === 'select') {
      const { minX, minY, width, height } = selectionRect;
      
      ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(minX - 5, minY - 5, width + 10, height + 10);
      ctx.setLineDash([]);

      const hs = 8 / zoomScale; 
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 1.5;
      const drawSquare = (cx: number, cy: number) => {
        ctx.fillRect(cx - hs/2, cy - hs/2, hs, hs);
        ctx.strokeRect(cx - hs/2, cy - hs/2, hs, hs);
      };

      drawSquare(minX - 5, minY - 5); // NW
      drawSquare(minX + width + 5, minY - 5); // NE
      drawSquare(minX - 5, minY + height + 5); // SW
      drawSquare(minX + width + 5, minY + height + 5); // SE
    }

    // 5. Render Lasso
    if (lassoPolygon.length > 1) {
      ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); 
      ctx.fillStyle = 'rgba(79, 70, 229, 0.1)';
      ctx.beginPath();
      ctx.moveTo(lassoPolygon[0].x, lassoPolygon[0].y); 
      lassoPolygon.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke(); 
      ctx.fill();
    }

    ctx.restore();
  };

  useEffect(() => { renderInk(); }, [activeStrokes, activeTextElements, currentStroke, lassoPolygon, selectedElementIds, activeResizeHandle]);

  // -- Event Logic --

  const getCoords = (e: React.PointerEvent) => {
    // We attach events to the container div or the top canvas.
    // Use inkCanvasRef for boundingRect
    const rect = inkCanvasRef.current!.getBoundingClientRect();
    return { 
      x: (e.clientX - rect.left) * (LOGICAL_WIDTH / rect.width), 
      y: (e.clientY - rect.top) * (LOGICAL_HEIGHT / rect.height) 
    };
  };

  const updateCursor = (p: Point) => {
    if (!inkCanvasRef.current) return;
    if (currentTool === 'select' && selectionRect) {
      const handle = hitTestResizeHandles(p, selectionRect, zoomScale);
      if (handle === 'nw' || handle === 'se') inkCanvasRef.current.style.cursor = 'nwse-resize';
      else if (handle === 'ne' || handle === 'sw') inkCanvasRef.current.style.cursor = 'nesw-resize';
      else if (
         p.x >= selectionRect.minX && p.x <= selectionRect.maxX && 
         p.y >= selectionRect.minY && p.y <= selectionRect.maxY
      ) {
        inkCanvasRef.current.style.cursor = 'move';
      } else {
        inkCanvasRef.current.style.cursor = 'default';
      }
    } else if (currentTool === 'lasso') {
      inkCanvasRef.current.style.cursor = 'crosshair';
    } else {
      inkCanvasRef.current.style.cursor = 'crosshair';
    }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    
    if (shapeDetectionTimeoutRef.current) {
      window.clearTimeout(shapeDetectionTimeoutRef.current);
      shapeDetectionTimeoutRef.current = null;
    }

    const p = getCoords(e);
    setDragStart(p);

    if (currentTool === 'select') {
      if (selectionRect) {
        const handle = hitTestResizeHandles(p, selectionRect, zoomScale);
        if (handle) {
          setInteractionMode('resizing');
          setActiveResizeHandle(handle);
          setResizeSnapshot({
            originalBounds: { ...selectionRect },
            originalStrokes: strokes.filter(s => selectedElementIds.includes(s.id)),
            originalText: textElements.filter(t => selectedElementIds.includes(t.id))
          });
          setTempStrokes(strokes); 
          setTempTextElements(textElements);
          return;
        }
      }

      // Hit Test Strokes
      const hitStroke = [...strokes].reverse().find(s => isPointNearStroke(p, s, 10 / zoomScale));
      
      // Hit Test Text
      let hitText = null;
      if (inkCanvasRef.current) {
         const ctx = inkCanvasRef.current.getContext('2d');
         if (ctx) {
            hitText = [...textElements].reverse().find(t => {
                const b = getTextBounds(t, ctx);
                // Simple point in rect check
                return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
            });
         }
      }

      if (hitText || hitStroke) {
        const id = hitText ? hitText.id : hitStroke!.id;
        if (!selectedElementIds.includes(id)) {
           // If shift key not pressed, replace selection (simplified: always replace for now unless multiselect logic added)
           setSelectedElementIds([id]); 
        }
        setInteractionMode('moving');
        setTempStrokes(strokes);
        setTempTextElements(textElements);
      } else {
        setSelectedElementIds([]);
        setInteractionMode('none');
      }
    } 
    else if (currentTool === 'lasso') {
      setInteractionMode('lassoing');
      setLassoPolygon([p]);
      setSelectedElementIds([]); 
    }
    else if (currentTool === 'eraser') {
      setInteractionMode('erasing');
      setCurrentStroke([p]);
      
      // Erase Strokes
      const hitIndex = strokes.findIndex(s => isPointNearStroke(p, s, strokeSize));
      
      // Erase Text
      let hitTextId: string | null = null;
      if (inkCanvasRef.current) {
         const ctx = inkCanvasRef.current.getContext('2d');
         if (ctx) {
            const hitT = textElements.find(t => {
                const b = getTextBounds(t, ctx);
                return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
            });
            if (hitT) hitTextId = hitT.id;
         }
      }

      if (hitIndex !== -1 || hitTextId) {
        const newStrokes = [...strokes];
        const newText = [...textElements];
        
        if (hitIndex !== -1) newStrokes.splice(hitIndex, 1);
        if (hitTextId) {
             const idx = newText.findIndex(t => t.id === hitTextId);
             if (idx !== -1) newText.splice(idx, 1);
        }

        setStrokes({ strokes: newStrokes, textElements: newText });
        setTempStrokes(null); 
        setTempTextElements(null);
      }
    }
    else {
      setInteractionMode('drawing');
      setCurrentStroke([p]);
      setSelectedElementIds([]);
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = getCoords(e);
    updateCursor(p);

    if (interactionMode === 'none') return;

    if (interactionMode === 'drawing') {
      setCurrentStroke(prev => [...prev, p]);
    } 
    else if (interactionMode === 'erasing') {
      setCurrentStroke(prev => [...prev, p]);
      // Vector Eraser: delete strokes we touch
      const hitId = strokes.find(s => isPointNearStroke(p, s, strokeSize))?.id;
      
      let hitTextId: string | null = null;
      if (inkCanvasRef.current) {
         const ctx = inkCanvasRef.current.getContext('2d');
         if (ctx) {
             const hitT = textElements.find(t => {
                const b = getTextBounds(t, ctx);
                return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
             });
             if (hitT) hitTextId = hitT.id;
         }
      }

      if (hitId || hitTextId) {
        setStrokes({ 
            strokes: hitId ? strokes.filter(s => s.id !== hitId) : strokes,
            textElements: hitTextId ? textElements.filter(t => t.id !== hitTextId) : textElements
        });
      }
    }
    else if (interactionMode === 'lassoing') {
      setLassoPolygon(prev => [...prev, p]);
    } 
    else if (interactionMode === 'moving' && dragStart && tempStrokes && tempTextElements) {
      const dx = p.x - dragStart.x;
      const dy = p.y - dragStart.y;
      
      const movedStrokes = strokes.map(s => 
        selectedElementIds.includes(s.id) 
          ? { ...s, points: s.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })), boundingBox: calcBoundingBox(s.points) } 
          : s
      );

      const movedText = textElements.map(t => 
         selectedElementIds.includes(t.id)
           ? { ...t, x: t.x + dx, y: t.y + dy }
           : t
      );

      setTempStrokes(movedStrokes);
      setTempTextElements(movedText);
    } 
    else if (interactionMode === 'resizing' && activeResizeHandle && resizeSnapshot && selectionRect) {
      const { originalBounds } = resizeSnapshot;
      let newMinX = originalBounds.minX, newMinY = originalBounds.minY;
      let newMaxX = originalBounds.maxX, newMaxY = originalBounds.maxY;

      if (activeResizeHandle.includes('w')) newMinX = p.x;
      if (activeResizeHandle.includes('e')) newMaxX = p.x;
      if (activeResizeHandle.includes('n')) newMinY = p.y;
      if (activeResizeHandle.includes('s')) newMaxY = p.y;

      if (newMaxX - newMinX < 5) newMaxX = newMinX + 5;
      if (newMaxY - newMinY < 5) newMaxY = newMinY + 5;

      const newBounds: BoundingBox = {
        minX: newMinX, minY: newMinY, maxX: newMaxX, maxY: newMaxY,
        width: newMaxX - newMinX, height: newMaxY - newMinY
      };

      const scaleY = newBounds.height / (originalBounds.height || 1);

      // Resize Strokes
      const resizedStrokes = strokes.map(s => {
        if (selectedElementIds.includes(s.id)) {
           const originalStroke = resizeSnapshot.originalStrokes.find(os => os.id === s.id);
           if (originalStroke) {
             const newPoints = resizeStrokePoints(originalStroke.points, originalBounds, newBounds);
             return { ...s, points: newPoints, boundingBox: calcBoundingBox(newPoints) };
           }
        }
        return s;
      });

      // Resize Text (Simplified: Scale Font Size and Map Position)
      const resizedText = textElements.map(t => {
         if (selectedElementIds.includes(t.id)) {
            const originalT = resizeSnapshot.originalText.find(ot => ot.id === t.id);
            if (originalT) {
                // Map position
                const nx = (originalT.x - originalBounds.minX) / (originalBounds.width || 1);
                const ny = (originalT.y - originalBounds.minY) / (originalBounds.height || 1);
                const newX = newBounds.minX + nx * newBounds.width;
                const newY = newBounds.minY + ny * newBounds.height;
                
                // Map size (use scaleY for font size primarily)
                const newSize = Math.max(8, originalT.fontSize * scaleY);
                return { ...t, x: newX, y: newY, fontSize: newSize };
            }
         }
         return t;
      });

      setTempStrokes(resizedStrokes);
      setTempTextElements(resizedText);
    }
  };

  const onUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (interactionMode === 'drawing' && currentStroke.length > 1) {
      const id = Date.now().toString();
      const s: Stroke = { 
        id, 
        points: currentStroke, 
        color, 
        width: strokeSize, 
        opacity: currentTool === 'highlighter' ? 0.4 : 1, 
        tool: currentTool, 
        brushType, 
        isProcessing: false, 
        boundingBox: calcBoundingBox(currentStroke) 
      };
      
      const newStrokesList = [...strokes, s];
      setStrokes({ strokes: newStrokesList });
      setCurrentStroke([]);

      if (smartShapesEnabled && (currentTool === 'pen' || currentTool === 'pencil')) {
        pendingStrokeIdsRef.current.add(id);
        if (shapeDetectionTimeoutRef.current) window.clearTimeout(shapeDetectionTimeoutRef.current);
        shapeDetectionTimeoutRef.current = window.setTimeout(() => {
          const idsToProcess = Array.from(pendingStrokeIdsRef.current);
          if (idsToProcess.length === 0) return;
          pendingStrokeIdsRef.current.clear();

          const groupStrokes = idsToProcess.map(sid => newStrokesList.find(st => st.id === sid)).filter(Boolean) as Stroke[];
          if (groupStrokes.length > 0) {
            const res = detectShapeGeometric(groupStrokes.map(st => st.points));
            if (res.shapes.length > 0) {
               let idsToRemove: string[] = [];
               let newStrokesToAdd: Stroke[] = [];
               res.shapes.forEach(shape => {
                  if (shape.strokeIndices.length > 0) {
                    const sourceIds = shape.strokeIndices.map(i => groupStrokes[i].id);
                    idsToRemove.push(...sourceIds);
                    const primary = groupStrokes[shape.strokeIndices[0]];
                    newStrokesToAdd.push({
                      id: `shape-${Date.now()}-${Math.random()}`,
                      points: shape.points,
                      color: primary.color,
                      width: primary.width,
                      opacity: primary.opacity,
                      tool: primary.tool,
                      brushType: primary.brushType,
                      isCorrected: true,
                      boundingBox: calcBoundingBox(shape.points)
                    });
                  }
               });
               if (newStrokesToAdd.length > 0) {
                 setStrokes({ strokes: [...newStrokesList.filter(st => !idsToRemove.includes(st.id)), ...newStrokesToAdd] });
               }
            }
          }
        }, SHAPE_DETECTION_DEBOUNCE_MS);
      }
    }
    else if (interactionMode === 'lassoing') {
      const capturedStrokeIds = strokes
        .filter(s => s.points.some(p => isPointInPolygon(p, lassoPolygon)))
        .map(s => s.id);
        
      // Capture Text
      let capturedTextIds: string[] = [];
      if (inkCanvasRef.current) {
          const ctx = inkCanvasRef.current.getContext('2d');
          if (ctx) {
              capturedTextIds = textElements
                .filter(t => {
                    const b = getTextBounds(t, ctx);
                    // Check center point for simplicity
                    return isPointInPolygon({x: t.x + b.width/2, y: t.y}, lassoPolygon);
                })
                .map(t => t.id);
          }
      }

      setSelectedElementIds([...capturedStrokeIds, ...capturedTextIds]);
      setLassoPolygon([]);
    }
    else if ((interactionMode === 'moving' || interactionMode === 'resizing') && tempStrokes && tempTextElements) {
      setStrokes({ strokes: tempStrokes, textElements: tempTextElements });
    }
    
    setInteractionMode('none'); 
    setActiveResizeHandle(null);
    setResizeSnapshot(null);
    setTempStrokes(null);
    setTempTextElements(null);
    setCurrentStroke([]);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full block touch-none">
       {/* Layer 0: Background / PDF (Passive) */}
       <canvas 
          ref={bgCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: 'none', zIndex: 0 }}
       />
       {/* Layer 1: Ink / Interactions (Active) */}
       <canvas 
          ref={inkCanvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', zIndex: 1 }}
          onPointerDown={onDown} 
          onPointerMove={onMove} 
          onPointerUp={onUp} 
          onPointerLeave={onUp}
       />
    </div>
  );
});

export default DrawingCanvas;
