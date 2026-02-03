
import React, { useRef, useState, useEffect } from 'react';
import { 
  Pen, Eraser, Highlighter, Trash2, BrainCircuit, Pointer, Plus, X, Hash, Shapes, LassoSelect, Sparkles, Download, Spline, Squircle, Cloud, Wind
} from 'lucide-react';
import { ToolType, BrushType } from '../types';

interface ToolbarProps {
  currentTool: ToolType;
  setCurrentTool: (tool: ToolType) => void;
  toolSettings: Record<string, { color: string; strokeSize: number; brushType: BrushType }>;
  updateToolSettings: (updates: Partial<{ color: string; strokeSize: number; brushType: BrushType }>) => void;
  onClear: () => void;
  onSolve: () => void;
  onCleanDiagram: () => void;
  onExport: () => void;
  isSolving: boolean;
  isSmartShapesActive: boolean;
  setIsSmartShapesActive: (val: boolean) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ 
  currentTool, setCurrentTool, toolSettings, updateToolSettings, onClear, onSolve, onCleanDiagram, onExport, isSolving, isSmartShapesActive, setIsSmartShapesActive
}) => {
  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 z-[100]">
      {/* Primary Tools */}
      <div className="bg-white/95 backdrop-blur-2xl border border-slate-200 shadow-2xl rounded-[32px] p-2 flex items-center gap-1">
        <div className="flex items-center gap-1 pr-2 border-r border-slate-100">
          <ToolButton active={currentTool === 'pen'} onClick={() => setCurrentTool('pen')} icon={<Pen size={18} />} label="Ink" />
          <ToolButton active={currentTool === 'highlighter'} onClick={() => setCurrentTool('highlighter')} icon={<Highlighter size={18} />} label="Mark" />
          <ToolButton active={currentTool === 'eraser'} onClick={() => setCurrentTool('eraser')} icon={<Eraser size={18} />} label="Erase" />
        </div>
        <div className="flex items-center gap-1 px-2 border-r border-slate-100">
          <ToolButton active={currentTool === 'select'} onClick={() => setCurrentTool('select')} icon={<Pointer size={18} />} label="Select" />
          <ToolButton active={currentTool === 'lasso'} onClick={() => setCurrentTool('lasso')} icon={<LassoSelect size={18} />} label="Lasso" />
          <ToolButton onClick={onClear} icon={<Trash2 size={18} />} label="Reset" variant="danger" />
        </div>
        <div className="flex items-center gap-1 px-2 border-r border-slate-100">
          <ToolButton active={isSmartShapesActive} onClick={() => setIsSmartShapesActive(!isSmartShapesActive)} icon={<Sparkles size={18} />} label="Smart Shapes" />
        </div>
        <div className="flex items-center gap-1 pl-2">
          <ToolButton onClick={onExport} icon={<Download size={18} />} label="Export" />
        </div>
      </div>

      {/* Action Buttons - Matching Screenshot */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onCleanDiagram} 
          disabled={isSolving}
          className="h-[56px] flex items-center gap-3 px-8 rounded-[24px] bg-[#0f172a] text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl hover:bg-black transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50"
        >
          <Shapes size={18} />
          Clean
        </button>

        <button 
          onClick={onSolve} 
          disabled={isSolving}
          className="h-[56px] flex items-center gap-3 px-8 rounded-[24px] bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-indigo-200 hover:shadow-indigo-400 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
          <BrainCircuit size={18} className={isSolving ? 'animate-spin' : ''} />
          {isSolving ? 'Solving...' : 'Solve UI'}
        </button>
      </div>
    </div>
  );
};

const ToolButton = ({ active, onClick, icon, label, variant }: any) => (
  <button 
    onClick={onClick} 
    className={`p-3 rounded-2xl transition-all relative group ${
      active 
        ? 'bg-indigo-50 text-indigo-600 shadow-sm' 
        : variant === 'danger' 
          ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' 
          : 'text-slate-500 hover:bg-slate-50'
    }`}
  >
    {icon}
    <span className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1 bg-slate-800 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
      {label}
    </span>
  </button>
);

export default Toolbar;
