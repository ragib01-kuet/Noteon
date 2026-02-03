
import { Point, SmartShapeResponse, RecognizedShape, Stroke } from '../types';

// --- Constants & Config ---
const RDP_EPSILON = 2.5; 
const CLOSED_THRESHOLD = 0.15; 
const LINEARITY_THRESHOLD = 0.98; 
const CIRCULARITY_THRESHOLD = 0.85; 

// --- Types ---
export interface BoundingBox { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; }
export type ResizeHandleType = 'nw' | 'ne' | 'sw' | 'se';

// --- Helpers ---
const dist = (p1: Point, p2: Point) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

const getPathLength = (points: Point[]) => {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) len += dist(points[i], points[i+1]);
  return len;
};

export const getBoundingBox = (points: Point[]): BoundingBox => {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

export const isPointInPolygon = (pt: Point, vs: Point[]) => {
  let x = pt.x, y = pt.y, inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].x, yi = vs[i].y, xj = vs[j].x, yj = vs[j].y;
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
};

// --- Resizing Logic ---

export const getResizeHandleRects = (bbox: BoundingBox, handleSize: number) => {
  const half = handleSize / 2;
  return {
    nw: { x: bbox.minX - half, y: bbox.minY - half, w: handleSize, h: handleSize },
    ne: { x: bbox.maxX - half, y: bbox.minY - half, w: handleSize, h: handleSize },
    sw: { x: bbox.minX - half, y: bbox.maxY - half, w: handleSize, h: handleSize },
    se: { x: bbox.maxX - half, y: bbox.maxY - half, w: handleSize, h: handleSize },
  };
};

export const hitTestResizeHandles = (p: Point, bbox: BoundingBox, scale: number): ResizeHandleType | null => {
  const handleSize = 12 / scale; // Adjust hit area based on zoom
  const handles = getResizeHandleRects(bbox, handleSize);
  
  const isHit = (rect: {x:number, y:number, w:number, h:number}) => 
    p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;

  if (isHit(handles.se)) return 'se';
  if (isHit(handles.sw)) return 'sw';
  if (isHit(handles.ne)) return 'ne';
  if (isHit(handles.nw)) return 'nw';
  return null;
};

/**
 * Resizes a stroke by mapping its points from the old bounding box to a new bounding box.
 * This ensures proportional scaling without drifting artifacts.
 */
export const resizeStrokePoints = (
  originalPoints: Point[], 
  oldBounds: BoundingBox, 
  newBounds: BoundingBox
): Point[] => {
  // Avoid division by zero
  const safeOldW = oldBounds.width || 1;
  const safeOldH = oldBounds.height || 1;

  return originalPoints.map(p => {
    // Calculate normalized position (0.0 to 1.0) relative to old bounds
    const nx = (p.x - oldBounds.minX) / safeOldW;
    const ny = (p.y - oldBounds.minY) / safeOldH;

    // Map to new bounds
    return {
      x: newBounds.minX + (nx * newBounds.width),
      y: newBounds.minY + (ny * newBounds.height)
    };
  });
};

// --- Shape Detection (Existing) ---

// Ramer-Douglas-Peucker Simplification
const simplifyPoints = (points: Point[], epsilon: number): Point[] => {
  if (points.length <= 2) return points;
  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  
  const findPerpendicularDist = (p: Point, p1: Point, p2: Point) => {
    if (p1.x === p2.x && p1.y === p2.y) return dist(p, p1);
    const num = Math.abs((p2.y - p1.y) * p.x - (p2.x - p1.x) * p.y + p2.x * p1.y - p2.y * p1.x);
    const den = Math.hypot(p2.y - p1.y, p2.x - p1.x);
    return num / den;
  };

  for (let i = 1; i < end; i++) {
    const d = findPerpendicularDist(points[i], points[0], points[end]);
    if (d > dmax) { index = i; dmax = d; }
  }

  if (dmax > epsilon) {
    const res1 = simplifyPoints(points.slice(0, index + 1), epsilon);
    const res2 = simplifyPoints(points.slice(index), epsilon);
    return [...res1.slice(0, -1), ...res2];
  }
  return [points[0], points[end]];
};

// Monotone Chain Convex Hull
const getConvexHull = (points: Point[]): Point[] => {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  
  lower.pop(); upper.pop();
  return [...lower, ...upper];
};

const getPolygonArea = (points: Point[]) => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
};

const isLine = (points: Point[]): boolean => {
  if (points.length < 2) return false;
  // Linear Regression
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  const n = points.length;
  for (const p of points) {
    sumX += p.x; sumY += p.y;
    sumXY += p.x * p.y; sumXX += p.x * p.x; sumYY += p.y * p.y;
  }
  
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));
  if (den === 0) return true; // Vertical or Horizontal perfect line
  const r2 = (num / den) ** 2;
  return r2 > LINEARITY_THRESHOLD;
};

const fitCircle = (points: Point[]) => {
  // Simple bbox average approach for center
  const bbox = getBoundingBox(points);
  const cx = bbox.minX + bbox.width / 2;
  const cy = bbox.minY + bbox.height / 2;
  const rx = bbox.width / 2;
  const ry = bbox.height / 2;
  return { x: cx, y: cy, rx, ry };
};

export const detectShapeGeometric = (strokeGroup: Point[][]): SmartShapeResponse => {
  // 1. Merge all points to analyze the "cloud"
  const allPoints = strokeGroup.flat();
  if (allPoints.length < 5) return { shapes: [] };

  const totalLength = getPathLength(allPoints);
  const bbox = getBoundingBox(allPoints);
  const endpoints = [allPoints[0], allPoints[allPoints.length - 1]];
  const isClosed = dist(endpoints[0], endpoints[1]) < (totalLength / strokeGroup.length) * CLOSED_THRESHOLD;

  // 2. Line Detection (Single Stroke Only usually)
  if (strokeGroup.length === 1 && !isClosed) {
    if (isLine(allPoints)) {
      return {
        shapes: [{
          type: 'line',
          confidence: 0.95,
          points: [allPoints[0], allPoints[allPoints.length - 1]],
          strokeIndices: [0]
        }]
      };
    }
  }

  // 3. Convex Hull Analysis for Closed Shapes (or Multi-stroke)
  const hull = getConvexHull(allPoints);
  const simpleHull = simplifyPoints(hull, Math.max(5, Math.min(bbox.width, bbox.height) * 0.05)); // Adaptive tolerance
  const hullArea = getPolygonArea(hull);
  const bboxArea = bbox.width * bbox.height;
  
  // Ratios
  const fillRatio = hullArea / bboxArea;
  const hullVertices = simpleHull.length;

  // 4. Classification Logic
  let shape: RecognizedShape | null = null;
  const confidence = 0.9;

  // Circle / Ellipse
  if (hullVertices > 5) {
    const { x, y, rx, ry } = fitCircle(hull);
    const aspectRatio = rx > ry ? rx / ry : ry / rx;
    
    if (aspectRatio < 1.2) {
      const points: Point[] = [];
      for (let i = 0; i <= 32; i++) {
        const theta = (i / 32) * Math.PI * 2;
        points.push({ x: x + rx * Math.cos(theta), y: y + rx * Math.sin(theta) }); 
      }
      shape = { type: 'circle', points, confidence, strokeIndices: strokeGroup.map((_, i) => i) };
    } else {
      const points: Point[] = [];
      for (let i = 0; i <= 32; i++) {
        const theta = (i / 32) * Math.PI * 2;
        points.push({ x: x + rx * Math.cos(theta), y: y + ry * Math.sin(theta) });
      }
      shape = { type: 'ellipse', points, confidence, strokeIndices: strokeGroup.map((_, i) => i) };
    }
  }
  // Triangle
  else if (hullVertices === 3 || (hullVertices === 4 && dist(simpleHull[0], simpleHull[3]) < 10)) {
     const pts = simpleHull.slice(0, 3);
     pts.push(pts[0]);
     shape = { type: 'triangle', points: pts, confidence, strokeIndices: strokeGroup.map((_, i) => i) };
  }
  // Rectangle / Square / Quad
  else if (hullVertices === 4 || (hullVertices === 5 && dist(simpleHull[0], simpleHull[4]) < 10)) {
     const pts = simpleHull.slice(0, 4);
     pts.push(pts[0]);
     if (fillRatio > 0.8) {
        shape = { 
          type: 'rectangle', 
          points: [
            { x: bbox.minX, y: bbox.minY },
            { x: bbox.maxX, y: bbox.minY },
            { x: bbox.maxX, y: bbox.maxY },
            { x: bbox.minX, y: bbox.maxY },
            { x: bbox.minX, y: bbox.minY }
          ],
          confidence, 
          strokeIndices: strokeGroup.map((_, i) => i)
        };
     } else {
        shape = { type: 'polygon', points: pts, confidence, strokeIndices: strokeGroup.map((_, i) => i) };
     }
  } else {
    if (isClosed) {
        shape = { type: 'polygon', points: simpleHull, confidence: 0.8, strokeIndices: strokeGroup.map((_, i) => i) };
    }
  }

  if (!shape && strokeGroup.length === 1) {
    if (simplifyPoints(allPoints, 5).length === 2) {
         shape = {
          type: 'line',
          confidence: 0.85,
          points: [allPoints[0], allPoints[allPoints.length - 1]],
          strokeIndices: [0]
        };
    }
  }

  return shape ? { shapes: [shape] } : { shapes: [] };
};
