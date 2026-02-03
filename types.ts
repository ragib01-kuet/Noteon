
export type ToolType = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'select' | 'lasso' | 'image' | 'smartShape';
export type BrushType = 'solid' | 'felt-tip' | 'charcoal' | 'spray-paint';

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
  brushType?: BrushType;
  isProcessing?: boolean;
  isCorrected?: boolean;
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface TextElement {
  id: string;
  text: string;
  x: number; // 0-100
  y: number; // 0-100
  color: string;
  fontSize: number;
  width?: number;
  height?: number;
}

export interface ImageElement {
  id: string;
  dataUrl: string;
  x: number; // 0-100
  y: number; // 0-100
  width: number; // 0-100 (percentage of canvas width)
  height: number; // 0-100 (percentage of canvas height)
}

export interface Page {
  id: string;
  strokes: Stroke[];
  textElements: TextElement[];
  imageElements: ImageElement[];
  template: 'blank' | 'ruled' | 'grid';
  backgroundUrl?: string; 
}

export interface Notebook {
  id: string;
  title: string;
  coverColor: string;
  template: 'blank' | 'ruled' | 'grid';
  pages: Page[];
  lastModified: number;
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

export interface DiagramResponse {
  shapes: {
    points: Point[]; 
    type: 'line' | 'circle' | 'rectangle' | 'arrow' | 'ellipse' | 'triangle';
    label?: string;
  }[];
  labels: {
    text: string;
    x: number; 
    y: number; 
    fontSize: number;
  }[];
}

export interface RecognizedShape {
  type: 'line' | 'circle' | 'rectangle' | 'triangle' | 'arrow' | 'ellipse' | 'polygon' | 'none';
  points: Point[];
  confidence: number;
  strokeIndices: number[]; // Indices of the strokes that formed this shape
}

export interface SmartShapeResponse {
  shapes: RecognizedShape[];
}
