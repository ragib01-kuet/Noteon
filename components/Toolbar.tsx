
import React, { useRef } from 'react';
import { 
  Pen, 
  Eraser, 
  Highlighter, 
  Trash2, 
  BrainCircuit, 
  Pencil,
  Download,
  Pointer,
  Image as ImageIcon
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
  onInsertImage: (dataUrl: string) => void;
  isSolving: boolean;
}

const COLORS = [
  '#0f172a', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#4f46e5'
];

const Toolbar: React.FC<ToolbarProps> = ({ 
  currentTool, 
  setCurrentTool, 
  color, 
  setColor, 
  onClear, 
  onSolve,
  onExport,
  onInsertImage,
  isSolving 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onInsertImage(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50">
      <div className="bg-white/90 backdrop-blur-2xl border border-slate-200 shadow-2xl rounded-[28px] p-2 flex items-center gap-1 transition-all duration-300">
        
        {/* Tool Group */}
        <div className="flex items-center gap-1 pr-3 border-r border-slate-100">
          <ToolButton 
            active={currentTool === 'pen'} 
            onClick={() => setCurrentTool('pen')} 
            icon={<Pen size={20} />} 
            label="Ink Pen"
          />
          <ToolButton 
            active={currentTool === 'pencil'} 
            onClick={() => setCurrentTool('pencil')} 
            icon={<Pencil size={20} />} 
            label="Pencil"
          />
          <ToolButton 
            active={currentTool === 'highlighter'} 
            onClick={() => setCurrentTool('highlighter')} 
            icon={<Highlighter size={20} />} 
            label="Mark"
          />
          <ToolButton 
            active={currentTool === 'lasso'} 
            onClick={() => setCurrentTool('lasso')} 
            icon={<Pointer size={20} className="rotate-45" />} 
            label="Lasso"
          />
          <ToolButton 
            active={currentTool === 'eraser'} 
            onClick={() => setCurrentTool('eraser')} 
            icon={<Eraser size={20} />} 
            label="Eraser"
          />
          <ToolButton 
            onClick={handleImageClick}
            icon={<ImageIcon size={20} />} 
            label="Image"
          />
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
          />
        </div>

        {/* Color Palette */}
        <div className="flex items-center gap-1.5 px-3 border-r border-slate-100">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`group relative flex items-center justify-center transition-all`}
            >
              <div 
                className={`w-6 h-6 rounded-full transition-all border-2 ${color === c ? 'scale-125 shadow-lg border-white ring-2 ring-indigo-500/20' : 'border-transparent scale-100 hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            </button>
          ))}
        </div>

        {/* Action Group */}
        <div className="flex items-center gap-1 pl-2">
          <ToolButton 
            onClick={onClear} 
            icon={<Trash2 size={20} />} 
            label="Clear" 
            variant="danger"
          />
          <ToolButton 
            onClick={onExport} 
            icon={<Download size={20} />} 
            label="Export"
          />
        </div>
      </div>

      {/* AI Solve Button */}
      <button
        onClick={onSolve}
        disabled={isSolving}
        className={`h-[60px] flex items-center gap-3 px-8 rounded-[28px] font-bold transition-all shadow-2xl active:scale-95 group overflow-hidden relative ${
          isSolving 
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' 
            : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-1'
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
        <BrainCircuit size={22} className={isSolving ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'} />
        <span className="tracking-tight">{isSolving ? 'Analyzing...' : 'Smart Solve'}</span>
      </button>
    </div>
  );
};

const ToolButton = ({ active, onClick, icon, label, variant }: any) => (
  <button
    onClick={onClick}
    className={`relative group p-3 rounded-2xl transition-all ${
      active 
        ? 'bg-indigo-50 text-indigo-600 shadow-sm' 
        : variant === 'danger' 
          ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
    }`}
  >
    {icon}
    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap uppercase tracking-widest">
      {label}
    </span>
  </button>
);

export default Toolbar;
