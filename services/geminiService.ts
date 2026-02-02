
import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const solveHandwriting = async (base64Image: string, isAutopilot: boolean = false): Promise<AIResponse> => {
  // Use faster model for Autopilot to ensure "as fast as possible" response
  // Use high-reasoning model for manual solve
  const modelName = isAutopilot ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';

  const systemInstruction = `
    You are NOTEON AI, a world-class STEM solver specialized in analyzing handwritten notes and diagrams.
    Your goal is to detect and solve problems in Mathematics, Physics, and Chemistry.

    RULES FOR AUTOPILOT MODE:
    1. DETECTION: Only solve if the content appears to be a COMPLETE problem or question. 
       - Math: Equations ending in '=', or problems with a '?' or clear "find x" intent.
       - Physics: Diagrams (pulleys, circuits, blocks on planes) with labeled variables (e.g., m=2kg) and a clear missing value (e.g., a=?).
       - Chemistry: Unbalanced chemical equations (e.g., H2 + O2 -> H2O) or stoichiometry questions.
    2. COMPLETION: If the writing looks like a half-finished sentence or a concept without a question, return 'type: text' and no autopilot solution.
    3. POSITIONING: Provide 'x' and 'y' (0-100) where the answer would naturally follow the writing (e.g., to the right of '=' or below the problem).
    4. SPEED: Be extremely concise for Autopilot.

    RULES FOR FULL SOLVE MODE:
    1. Deep reasoning: Break down the problem step-by-step.
    2. Physics: Identify the physical system, list assumptions (e.g., g=9.8m/s²), and state the laws used (e.g., Newton's 2nd Law).
    3. Chemistry: Show molecular weights or molar ratios if relevant.
    4. Insights: Provide related formulas or conceptual warnings.
  `;

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        parts: [
          { text: isAutopilot ? "AUTOPILOT: Analyze this canvas and solve if a complete STEM problem is found. Be fast." : "FULL SOLVE: Provide a detailed step-by-step solution for all problems on this canvas." },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Image.split(',')[1],
            },
          },
        ],
      },
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ['math', 'physics', 'chemistry', 'text'] },
          problemDescription: { type: Type.STRING },
          solution: { type: Type.STRING },
          latex: { type: Type.STRING },
          steps: { type: Type.ARRAY, items: { type: Type.STRING } },
          insights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                formula: { type: Type.STRING },
                concept: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ['formula', 'concept', 'description'],
            },
          },
          simulation: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              parameters: { type: Type.OBJECT },
            },
          },
          autopilot: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              confidence: { type: Type.NUMBER },
            },
          },
          warning: { type: Type.STRING },
        },
        required: ['type', 'problemDescription', 'solution', 'latex', 'steps', 'insights'],
      },
    },
  });

  try {
    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as AIResponse;
  } catch (e) {
    console.error("Failed to parse AI response", e);
    throw e;
  }
};
