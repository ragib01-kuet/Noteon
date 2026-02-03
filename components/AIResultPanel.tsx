
import React, { useState } from 'react';
import { X, ChevronRight, AlertCircle, Info, Sparkles, Copy, PlayCircle, BookMarked, Atom } from 'lucide-react';
import { AIResponse } from '../types';

interface AIResultPanelProps {
  result: AIResponse | null;
  onClose: () => void;
}

const AIResultPanel: React.FC<AIResultPanelProps> = ({ result, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const copyLatex = () => {
    if (result.latex) {
      navigator.clipboard.writeText(result.latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed top-20 right-6 w-[420px] max-h-[85vh] bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-3xl flex flex-col z-[60] animate-in slide-in-from-right duration-500 overflow-hidden">
      {/* Premium Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200">
            <Atom size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-lg capitalize">{result.type || "General"} Intelligence</h3>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">AI Solver Active</p>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200/50 rounded-full transition-colors text-slate-400">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Solution & LaTeX Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Result</h4>
            <button 
              onClick={copyLatex}
              disabled={!result.latex}
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-md transition-all ${copied ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50'}`}
            >
              <Copy size={12} />
              {copied ? 'COPIED LaTeX' : 'COPY LaTeX'}
            </button>
          </div>
          <div className="bg-slate-900 p-5 rounded-2xl shadow-inner group relative">
             <p className="text-2xl font-bold text-indigo-400 font-mono mb-2 break-all">
               {result.solution || "Analysis Complete"}
             </p>
             <code className="text-[11px] text-slate-500 block truncate font-mono bg-black/30 p-2 rounded">
               {result.latex || "No LaTeX source available"}
             </code>
          </div>
        </section>

        {/* Steps */}
        <section>
          <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-widest flex items-center gap-2">
            <Info size={12} /> Logical Derivation
          </h4>
          <div className="space-y-4">
            {(result.steps && result.steps.length > 0) ? (
              result.steps.map((step, idx) => (
                <div key={idx} className="flex gap-4 group">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 bg-white border-2 border-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-sm transition-colors group-hover:border-indigo-400">
                      {idx + 1}
                    </div>
                    {idx !== result.steps.length - 1 && <div className="w-0.5 h-full bg-slate-100 mt-2"></div>}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed pt-1 group-hover:text-slate-900 transition-colors">
                    {step}
                  </p>
                </div>
              ))
            ) : (
               <p className="text-sm text-slate-400 italic">No derivation steps provided.</p>
            )}
          </div>
        </section>

        {/* Simulation Preview (Unique Feature) */}
        {result.simulation && (
          <section className="p-4 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PlayCircle size={18} />
                <span className="text-sm font-bold">Interactive Simulation</span>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full uppercase">Alpha</span>
            </div>
            <p className="text-xs text-indigo-100 mb-4">AI detected a {result.simulation.type} model. Ready to simulate motion physics.</p>
            <button className="w-full py-2 bg-white text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors">
              Launch Viewer
            </button>
          </section>
        )}

        {/* Insights Section */}
        {result.insights && result.insights.length > 0 && (
          <section>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-widest flex items-center gap-2">
              <BookMarked size={12} /> Predictive Insights
            </h4>
            <div className="grid gap-3">
              {result.insights.map((insight, idx) => (
                <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer group">
                  <p className="text-[10px] font-black text-indigo-500 uppercase mb-1 tracking-tighter">{insight.concept}</p>
                  <p className="text-xs font-bold text-slate-700 mb-2 group-hover:text-indigo-700">{insight.formula}</p>
                  <p className="text-[11px] text-slate-500 leading-tight">{insight.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      
      <div className="p-6 border-t border-slate-100 bg-slate-50/50">
        <button className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-2xl hover:bg-slate-900 transition-all text-sm font-bold shadow-lg active:scale-95">
          <Sparkles size={16} />
          <span>Save to Formula Library</span>
        </button>
      </div>
    </div>
  );
};

export default AIResultPanel;
