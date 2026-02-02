
import React from 'react';
import { 
  Pen, 
  Eraser, 
  Highlighter, 
  Trash2, 
  BrainCircuit, 
  Type, 
  Pencil,
  Grid,
  FileText,
  Download,
  Pointer
} from 'lucide-react';
import { ToolType } from '../types';

interface ToolbarProps {
  currentTool: ToolType;
  setCurrentTool: (tool: ToolType) => void;
  color: string;
  setColor: (color: string) => void;
  onClear: () => void;
  onSolve: () => void;
  onExport: () => void;
  isSolving: boolean;
}

const COLORS = [
  '#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'
];

const Toolbar: React.FC<ToolbarProps> = ({ 
  currentTool, 
  setCurrentTool, 
  color, 
  setColor, 
  onClear, 
  onSolve,
  onExport,
  isSolving 
}) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-6 z-50 transition-all duration-300">
      <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
        <button
          onClick={() => setCurrentTool('pen')}
          className={`p-2 rounded-xl transition-all ${currentTool === 'pen' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Pen"
        >
          <Pen size={20} />
        </button>
        <button
          onClick={() => setCurrentTool('pencil')}
          className={`p-2 rounded-xl transition-all ${currentTool === 'pencil' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Pencil"
        >
          <Pencil size={20} />
        </button>
        <button
          onClick={() => setCurrentTool('lasso')}
          className={`p-2 rounded-xl transition-all ${currentTool === 'lasso' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Lasso Select"
        >
          <Pointer size={20} className="rotate-45" />
        </button>
        <button
          onClick={() => setCurrentTool('highlighter')}
          className={`p-2 rounded-xl transition-all ${currentTool === 'highlighter' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Highlighter"
        >
          <Highlighter size={20} />
        </button>
        <button
          onClick={() => setCurrentTool('eraser')}
          className={`p-2 rounded-xl transition-all ${currentTool === 'eraser' ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          title="Object Eraser"
        >
          <Eraser size={20} />
        </button>
      </div>

      <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-indigo-400 scale-125' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onClear}
          className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          title="Clear Page"
        >
          <Trash2 size={20} />
        </button>
        <button
          onClick={onExport}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
          title="Export PDF"
        >
          <Download size={20} />
        </button>
        <button
          onClick={onSolve}
          disabled={isSolving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all shadow-lg ${
            isSolving 
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95'
          }`}
        >
          <BrainCircuit size={18} className={isSolving ? 'animate-pulse' : ''} />
          <span>{isSolving ? 'Analyzing...' : 'Solve'}</span>
        </button>
      </div>
    </div>
  );
};

export default Toolbar;
