
export type ToolType = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'select' | 'lasso';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  opacity: number;
  tool: ToolType;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface TextElement {
  id: string;
  text: string;
  x: number; // 0-100
  y: number; // 0-100
  color: string;
  fontSize: number;
  width?: number; // Estimated for selection
  height?: number;
}

export interface Page {
  id: string;
  strokes: Stroke[];
  textElements: TextElement[];
  template: 'blank' | 'ruled' | 'grid';
  title: string;
  tags: string[];
}

export interface AIResponse {
  type: 'math' | 'physics' | 'chemistry' | 'text';
  problemDescription: string;
  solution: string;
  latex: string;
  steps: string[];
  insights: {
    formula: string;
    concept: string;
    description: string;
  }[];
  simulation?: {
    type: string;
    parameters: {
      initialVelocity?: number;
      angle?: number;
      mass?: number;
      gravity?: number;
      frictionCoefficient?: number;
    };
  };
  autopilot?: {
    answer: string;
    x: number; 
    y: number; 
    confidence: number;
  };
  warning?: string;
}
