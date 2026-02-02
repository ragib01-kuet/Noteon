
import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const solveHandwriting = async (base64Image: string, isAutopilot: boolean = false): Promise<AIResponse> => {
  const model = isAutopilot ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview'; 

  const prompt = `
    You are the NOTEON AI Architect. Analyze the handwritten notes or sketches.
    
    ${isAutopilot ? `
    AUTOPILOT MODE: 
    - CRITICAL: ONLY solve if you see an equation ending in '=' with NO handwritten answer following it.
    - If an equation already has a result (either handwritten or typed) next to the '=', DO NOT provide an autopilot answer.
    - Speed is critical. 
    - SPATIAL ACCURACY: The 'y' coordinate MUST be the exact vertical baseline of the equation.
    - The 'x' coordinate should be slightly to the right of the '=' sign.
    ` : `
    FULL SOLVE MODE:
    - Analyze the entire page context.
    - Provide deep reasoning, steps, and conceptual insights.
    `}
    
    REQUIRED OUTPUTS:
    1. Problem Type: Math, Physics, or Chemistry.
    2. Description: Concise summary.
    3. Solution: The final answer.
    4. LaTeX: LaTeX representation.
    5. Reasoning: Step-by-step logic.
    6. Insights: Related concepts/formulas.
    7. Simulation: Physical model if applicable.
    8. Autopilot: Only if equation is COMPLETE (ends in '=') and UNANSWERED. Provide 'answer' and 'x', 'y' (0-100 normalized).

    STRICT JSON SCHEMA REQUIRED.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: base64Image.split(',')[1] } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        temperature: isAutopilot ? 0.0 : 0.7, // Zero temp for autopilot to be stable
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
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
                  description: { type: Type.STRING }
                },
                required: ['formula', 'concept', 'description']
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
            autopilot: {
              type: Type.OBJECT,
              properties: {
                answer: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER }
              },
              required: ['answer', 'x', 'y']
            },
            warning: { type: Type.STRING }
          },
          required: ['type', 'problemDescription', 'solution', 'latex', 'steps', 'insights']
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return result as AIResponse;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to process handwriting with AI.");
  }
};
