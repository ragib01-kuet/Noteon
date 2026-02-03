
import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse, DiagramResponse, SmartShapeResponse, Point } from "../types";

// Safe access to API Key to prevent ReferenceError in browsers
const getApiKey = () => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore reference errors
  }
  return '';
};

/**
 * Simplifies points to reduce token usage and noise.
 */
const simplifyPoints = (points: Point[], epsilon: number): Point[] => {
  if (points.length <= 2) return points;
  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  const findDist = (p: Point, p1: Point, p2: Point) => {
    if (p1.x === p2.x && p1.y === p2.y) return Math.hypot(p.x - p1.x, p.y - p1.y);
    const num = Math.abs((p2.y - p1.y) * p.x - (p2.x - p1.x) * p.y + p2.x * p1.y - p2.y * p1.x);
    const den = Math.hypot(p2.y - p1.y, p2.x - p1.x);
    return num / den;
  };
  for (let i = 1; i < end; i++) {
    const d = findDist(points[i], points[0], points[end]);
    if (d > dmax) { index = i; dmax = d; }
  }
  if (dmax > epsilon) {
    const res1 = simplifyPoints(points.slice(0, index + 1), epsilon);
    const res2 = simplifyPoints(points.slice(index), epsilon);
    return [...res1.slice(0, -1), ...res2];
  }
  return [points[0], points[end]];
};

/**
 * Normalizes a GROUP of strokes into a single 1000x1000 coordinate space.
 * This allows the AI to see the relative position of separate strokes (e.g. 4 lines forming a square).
 */
const normalizeStrokeGroup = (strokeGroup: Point[][]) => {
  const allPoints = strokeGroup.flat();
  if (allPoints.length === 0) return { normalizedStrokes: [], bbox: { x: 0, y: 0, w: 0, h: 0 } };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  allPoints.forEach(p => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });

  const w = maxX - minX || 1;
  const h = maxY - minY || 1;

  // Normalize each stroke individually but relative to the global group bbox
  const normalizedStrokes = strokeGroup.map(stroke => 
    stroke.map(p => ({
      x: Math.round(((p.x - minX) / w) * 1000),
      y: Math.round(((p.y - minY) / h) * 1000)
    }))
  );

  return { normalizedStrokes, bbox: { x: minX, y: minY, w, h } };
};

/**
 * Accepts an array of strokes (Point[][]) to allow multi-stroke shape detection.
 */
export const autoCorrectShapeAI = async (strokeGroup: Point[][]): Promise<SmartShapeResponse> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("API Key missing for Shape AI");
    return { shapes: [] };
  }
  const ai = new GoogleGenAI({ apiKey });
  
  // 1. Simplify all strokes first
  const simplifiedGroup = strokeGroup.map(s => simplifyPoints(s, 2.0));
  
  // 2. Normalize based on the combined bounding box
  const { normalizedStrokes, bbox } = normalizeStrokeGroup(simplifiedGroup);
  
  // 3. Stringify for the prompt with explicit indices
  const strokesStr = normalizedStrokes.map((s, i) => 
    `Stroke_Index ${i}: ` + s.map(p => `[${p.x},${p.y}]`).join(',')
  ).join('\n');

  const systemInstruction = `
    You are a high-performance Stroke Segmentation & Geometry Engine.
    
    INPUT: A list of numbered strokes (Stroke_Index 0, Stroke_Index 1...).
    TASK: 
    1. ANALYZE the spatial relationship between strokes.
    2. SEGMENT the strokes into distinct clusters (e.g. Strokes 0,1,2 form a Triangle; Stroke 3 forms a Line).
    3. RECOGNIZE the geometric shape for each cluster.
    
    PRIMITIVES: 'triangle', 'rectangle', 'square', 'circle', 'ellipse', 'line', 'arrow', 'polygon'.
    
    RULES:
    - If strokes connect end-to-end, they likely form one shape.
    - If a shape is recognized, return PERFECT vertices for it.
    - You must return 'strokeIndices' array listing EXACTLY which input strokes belong to that shape.
    - Ignore text or scribbles (do not include them in any shape).
    - CONFIDENCE > 0.85 required.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: `Segment and identify shapes in this point cloud:\n${strokesStr}` }] }],
      config: { 
        systemInstruction, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shapes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ['line', 'circle', 'rectangle', 'triangle', 'arrow', 'ellipse', 'polygon', 'none'] },
                  strokeIndices: { 
                    type: Type.ARRAY, 
                    items: { type: Type.INTEGER },
                    description: "The indices of the input strokes that make up this specific shape."
                  },
                  points: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER }
                      },
                      required: ['x', 'y']
                    }
                  },
                  confidence: { type: Type.NUMBER }
                },
                required: ['type', 'points', 'confidence', 'strokeIndices']
              }
            }
          },
          required: ['shapes']
        }
      },
    });

    const text = response.text?.replace(/```json|```/g, "").trim();
    if (!text) throw new Error("Empty AI response");
    const result = JSON.parse(text) as SmartShapeResponse;

    // Denormalize: Map the 0-1000 points back to the original canvas location
    result.shapes = result.shapes.map(shape => {
      if (shape.type !== 'none' && shape.confidence > 0.75) {
        return {
          ...shape,
          points: shape.points.map(p => ({
            x: bbox.x + (p.x / 1000) * bbox.w,
            y: bbox.y + (p.y / 1000) * bbox.h
          }))
        };
      }
      return shape;
    }).filter(s => s.type !== 'none' && s.confidence > 0.75);

    return result;
  } catch (e) {
    console.error("SmartShape Engine Failed:", e);
    return { shapes: [] };
  }
};

export const solveHandwriting = async (base64Image: string, isAutopilot: boolean = false): Promise<AIResponse> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey });
  const model = isAutopilot ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: isAutopilot ? "AUTOPILOT: Solve problem." : "FULL SOLVE: Deep derivation." }, { inlineData: { mimeType: "image/png", data: base64Image.split(',')[1] } }] }],
      config: { responseMimeType: "application/json" },
    });
    return JSON.parse(response.text?.replace(/```json|```/g, "") || "{}") as AIResponse;
  } catch (e) { throw e; }
};

export const cleanPhysicsDiagram = async (base64Image: string): Promise<DiagramResponse> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [{ parts: [{ text: "Vectorize diagram." }, { inlineData: { mimeType: "image/png", data: base64Image.split(',')[1] } }] }],
      config: { responseMimeType: "application/json" },
    });
    return JSON.parse(response.text?.replace(/```json|```/g, "") || "{}") as DiagramResponse;
  } catch (e) { throw e; }
};
