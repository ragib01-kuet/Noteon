
import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse, DiagramResponse, SmartShapeResponse, HandwritingResponse, Point } from "../types";

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
    
    // Attempt to parse JSON safely, even if there is extra text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : text) as SmartShapeResponse;

    if (!result || !Array.isArray(result.shapes)) return { shapes: [] };

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

const solverResponseSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ['math', 'physics', 'chemistry', 'text'] },
    problemDescription: { type: Type.STRING },
    solution: { type: Type.STRING },
    latex: { type: Type.STRING },
    steps: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING } 
    },
    insights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          formula: { type: Type.STRING },
          concept: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ['formula', 'concept', 'description']
      }
    },
    autopilot: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          x: { type: Type.NUMBER },
          y: { type: Type.NUMBER },
          confidence: { type: Type.NUMBER },
        },
        required: ['answer', 'x', 'y', 'confidence']
      }
    },
    simulation: {
       type: Type.OBJECT,
       properties: {
          type: { type: Type.STRING },
          parameters: {
             type: Type.OBJECT,
             properties: {
                initialVelocity: { type: Type.NUMBER },
                angle: { type: Type.NUMBER },
                mass: { type: Type.NUMBER },
                gravity: { type: Type.NUMBER },
                frictionCoefficient: { type: Type.NUMBER }
             }
          }
       }
    },
    warning: { type: Type.STRING }
  },
  required: ['type', 'solution', 'latex', 'steps', 'problemDescription']
};

export const solveHandwriting = async (base64Image: string, isAutopilot: boolean = false): Promise<AIResponse> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey });
  const model = isAutopilot ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';
  
  const autopilotInstruction = `
    AUTOPILOT MODE:
    1. Identify ALL distinct handwritten math problems in the image.
    2. Solve each problem.
    3. Return a list of 'autopilot' objects.
    4. For each object, provide the 'answer' string and the (x, y) coordinates where the answer should be written.
    5. COORDINATES: The image is 1000x1000 units. Estimate the (x, y) for the empty space after the equals sign.
    6. Return purely JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ 
        parts: [
          { text: isAutopilot ? autopilotInstruction : "FULL SOLVE: Analyze and derive the solution. Return purely JSON." }, 
          { inlineData: { mimeType: "image/png", data: base64Image.split(',')[1] } }
        ] 
      }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: solverResponseSchema
      },
    });

    const rawText = response.text;
    if (!rawText) throw new Error("AI returned no text response.");

    // Robust JSON extraction to handle thought traces
    let jsonStr = rawText.trim();
    const jsonStart = jsonStr.indexOf('{');
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
    }
    
    return JSON.parse(jsonStr) as AIResponse;
  } catch (e) { 
    console.error("AI Solve Failed:", e);
    throw e; 
  }
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

export const recognizeHandwriting = async (base64Image: string): Promise<HandwritingResponse> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{
        parts: [
          { text: "Transcribe all handwritten text in this image. Group text into logical blocks or lines. Return the text content and the (x, y) center coordinates for each block. The image coordinate system is 1000x1000. Ignore simple lines or drawings that are not text." },
          { inlineData: { mimeType: "image/png", data: base64Image.split(',')[1] } }
        ]
      }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            textBlocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER }
                },
                required: ['text', 'x', 'y']
              }
            }
          },
          required: ['textBlocks']
        }
      }
    });
    
    const text = response.text?.replace(/```json|```/g, "").trim();
    if (!text) throw new Error("Empty AI response");
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : text) as HandwritingResponse;
  } catch (e) {
    console.error("Handwriting Recognition Failed:", e);
    throw e;
  }
};
