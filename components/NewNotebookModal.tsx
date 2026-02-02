
import React, { useState } from 'react';
import { X, Book, LayoutGrid, FileText, Check, Layers, Palette, Hash } from 'lucide-react';

interface NewNotebookModalProps {
  onClose: () => void;
  onCreate: (data: { title: string; color: string; template: 'blank' | 'ruled' | 'grid' }) => void;
}

const COLORS = [
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Slate', value: '#0f172a' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Violet', value: '#8b5cf6' },
];

const TEMPLATES = [
  { id: 'blank', name: 'Blank Canvas', desc: 'Free-form sketches', icon: <div className="w-full h-full border border-slate-200 rounded-lg bg-white" /> },
  { id: 'ruled', name: 'Academic Ruled', desc: 'Structured notes', icon: <div className="w-full h-full border border-slate-200 rounded-lg bg-white flex flex-col justify-around py-1 px-1"><div className="h-[1px] bg-slate-200"/><div className="h-[1px] bg-slate-200"/><div className="h-[1px] bg-slate-200"/><div className="h-[1px] bg-slate-200"/></div> },
  { id: 'grid', name: 'Engineering Grid', desc: 'Precision & Math', icon: <div className="w-full h-full border border-slate-200 rounded-lg bg-white grid grid-cols-4 grid-rows-4"><div className="border-[0.5px] border-slate-50"/><div className="border-[0.5px] border-slate-50"/><div className="border-[0.5px] border-slate-50"/><div className="border-[0.5px] border-slate-50"/><div className="border-[0.5px] border-slate-50"/><div className="border-[0.5px] border-slate-50"/><div className="border-[0.5px] border-slate-50"/><div className="border-[0.5px] border-slate-50"/></div> },
];

const NewNotebookModal: React.FC<NewNotebookModalProps> = ({ onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);
  const [selectedTemplate, setSelectedTemplate] = useState<'blank' | 'ruled' | 'grid'>('grid');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title, color: selectedColor, template: selectedTemplate });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl animate-in fade-in duration-500" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-[48px] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] flex flex-col md:flex-row overflow-hidden animate-in zoom-in fade-in duration-500">
        <div className="absolute top-0 right-0 p-4 md:p-8 z-20">
          <button onClick={onClose} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Left Preview Sidebar - Hidden on small heights */}
        <div className="w-full md:w-64 bg-slate-50 border-r border-slate-100 p-8 flex-shrink-0 flex flex-col items-center justify-center gap-6 hidden md:flex">
          <div className="relative w-full aspect-[3/4] bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-200 transform hover:scale-105 transition-transform duration-500">
             <div className="absolute left-0 top-0 bottom-0 w-6 bg-black/[0.04] z-10"></div>
             <div className="absolute top-0 right-0 left-0 h-24 opacity-20" style={{ backgroundColor: selectedColor }}></div>
             <div className="p-6 pt-10 flex flex-col h-full relative z-20">
                <div className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: selectedColor }}>
                  <Book size={20} />
                </div>
                <div className="h-4 w-3/4 bg-slate-100 rounded-full mb-2"></div>
                <div className="h-4 w-1/2 bg-slate-50 rounded-full"></div>
             </div>
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Live Preview</p>
        </div>

        {/* Right Form - Scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight mb-2">New Workspace</h2>
              <p className="text-sm text-slate-500 font-medium">Configure your notebook's personality.</p>
            </div>

            <div className="space-y-8">
              {/* Title input */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Hash size={12} /> Notebook Designation
                </label>
                <input 
                  autoFocus
                  type="text" 
                  placeholder="e.g. Theoretical Physics II" 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-[22px] px-6 py-4 text-lg md:text-xl font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all placeholder:text-slate-300"
                />
              </div>

              {/* Color select */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Palette size={12} /> Branding Aesthetic
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  {COLORS.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setSelectedColor(color.value)}
                      className={`relative w-8 h-8 md:w-10 md:h-10 rounded-xl transition-all ${selectedColor === color.value ? 'scale-125 shadow-xl ring-4 ring-indigo-500/20' : 'hover:scale-110'}`}
                      style={{ backgroundColor: color.value }}
                    >
                      {selectedColor === color.value && <Check className="absolute inset-0 m-auto text-white" size={16} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template select */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={12} /> Geometric Context
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {TEMPLATES.map(template => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setSelectedTemplate(template.id as any)}
                      className={`flex items-center sm:flex-col gap-4 p-4 rounded-[28px] border-2 transition-all text-left sm:text-center ${selectedTemplate === template.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 hover:border-slate-200 bg-slate-50'}`}
                    >
                      <div className="w-12 sm:w-full aspect-square bg-white rounded-xl shadow-sm p-2 flex-shrink-0">
                        {template.icon}
                      </div>
                      <div>
                        <span className={`block text-[10px] font-black uppercase tracking-widest ${selectedTemplate === template.id ? 'text-indigo-600' : 'text-slate-900'}`}>
                          {template.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 pb-4">
              <button 
                type="submit"
                className="w-full py-4 md:py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[26px] font-black text-lg md:text-xl shadow-2xl shadow-indigo-100 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
                disabled={!title.trim()}
              >
                Initialize Workspace
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NewNotebookModal;
