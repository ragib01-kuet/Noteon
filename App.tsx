
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Menu, 
  ChevronLeft, 
  Zap,
  Clock,
  Star,
  FileText,
  LayoutGrid,
  Settings,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Loader2,
  Undo2,
  Redo2
} from 'lucide-react';
import DrawingCanvas, { CanvasHandle } from './components/DrawingCanvas';
import Toolbar from './components/Toolbar';
import AIResultPanel from './components/AIResultPanel';
import Dashboard from './components/Dashboard';
import NewNotebookModal from './components/NewNotebookModal';
import { solveHandwriting, cleanPhysicsDiagram } from './services/geminiService';
import { convertPDFToImages } from './services/pdfService';
import { Page, ToolType, BrushType, AIResponse, Notebook, ImageElement, Stroke, TextElement } from './types';

const NavBtn = ({ active, icon, label, onClick }: { active?: boolean, icon: React.ReactNode, label: string, onClick?: () => void }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 px-5 py-4 rounded-[22px] font-black text-sm transition-all group ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
    <span className={active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600 transition-colors'}>{icon}</span>
    {label}
  </button>
);

const DEFAULT_TOOL_SETTINGS: Record<string, { color: string; strokeSize: number; brushType: BrushType }> = {
  pen: { color: '#0f172a', strokeSize: 2.5, brushType: 'solid' },
  pencil: { color: '#64748b', strokeSize: 2.0, brushType: 'charcoal' },
  highlighter: { color: '#facc15', strokeSize: 20.0, brushType: 'solid' },
  eraser: { color: '#ffffff', strokeSize: 15.0, brushType: 'solid' },
  lasso: { color: '#4f46e5', strokeSize: 1.5, brushType: 'solid' },
  select: { color: '#4f46e5', strokeSize: 1.5, brushType: 'solid' },
};

interface PageState {
  strokes: Stroke[];
  textElements: TextElement[];
  imageElements: ImageElement[];
}

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
    try {
      const saved = localStorage.getItem('noteon_notebooks');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return parsed.map((n: any) => ({
        ...n,
        id: n.id || `${Date.now()}-${Math.random()}`,
        pages: (n.pages || []).map((p: any) => ({
          ...p,
          strokes: p.strokes || [],
          textElements: p.textElements || [],
          imageElements: p.imageElements || [],
        }))
      })) as Notebook[];
    } catch (e) { return []; }
  });
  
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [toolSettings, setToolSettings] = useState(DEFAULT_TOOL_SETTINGS);
  const [isSmartShapesActive, setIsSmartShapesActive] = useState(false);

  const updateToolSettings = (updates: Partial<{ color: string; strokeSize: number; brushType: BrushType }>) => {
    setToolSettings(prev => ({ ...prev, [currentTool]: { ...prev[currentTool], ...updates } }));
  };

  const [history, setHistory] = useState<PageState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [autopilotResult, setAutopilotResult] = useState<{ answer: string; x: number; y: number; confidence: number } | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [isAutopilotOn, setIsAutopilotOn] = useState(false);
  const [zoomScale, setZoomScale] = useState(1.0);
  const canvasRef = useRef<CanvasHandle>(null);
  const autopilotTimerRef = useRef<number | null>(null);

  const activeNotebook = useMemo(() => notebooks.find(n => n.id === activeNotebookId), [notebooks, activeNotebookId]);
  const currentPage = useMemo(() => activeNotebook?.pages[currentPageIndex], [activeNotebook, currentPageIndex]);

  useEffect(() => {
    if (currentPage) {
      setHistory([{ strokes: [...currentPage.strokes], textElements: [...currentPage.textElements], imageElements: [...currentPage.imageElements] }]);
      setHistoryIndex(0);
    }
  }, [activeNotebookId, currentPageIndex]);

  useEffect(() => {
    if (isAutopilotOn && (currentPage?.strokes.length || 0) > 0) {
      if (autopilotTimerRef.current) window.clearTimeout(autopilotTimerRef.current);
      autopilotTimerRef.current = window.setTimeout(() => handleAutopilotSolve(), 1500);
    }
    return () => { if (autopilotTimerRef.current) window.clearTimeout(autopilotTimerRef.current); };
  }, [currentPage?.strokes, isAutopilotOn]);

  const handleUndo = () => { if (historyIndex > 0) { setHistoryIndex(historyIndex - 1); applyPageState(history[historyIndex - 1]); } };
  const handleRedo = () => { if (historyIndex < history.length - 1) { setHistoryIndex(historyIndex + 1); applyPageState(history[historyIndex + 1]); } };

  const applyPageState = (state: PageState) => {
    if (!activeNotebookId) return;
    setNotebooks(prev => prev.map(n => {
      if (n.id !== activeNotebookId) return n;
      const updatedPages = n.pages.map((p, idx) => idx === currentPageIndex ? { ...p, ...state } : p);
      return { ...n, pages: updatedPages, lastModified: Date.now() };
    }));
  };

  useEffect(() => { localStorage.setItem('noteon_notebooks', JSON.stringify(notebooks)); }, [notebooks]);

  const updatePage = (updates: Partial<Page>, skipHistory = false) => {
    if (!activeNotebookId || !currentPage) return;
    setNotebooks(prev => prev.map(n => {
      if (n.id !== activeNotebookId) return n;
      const updatedPages = n.pages.map((p, idx) => idx === currentPageIndex ? { ...p, ...updates } : p);
      return { ...n, pages: updatedPages, lastModified: Date.now() };
    }));
    if (!skipHistory) {
      const newState: PageState = { strokes: updates.strokes || [...currentPage.strokes], textElements: updates.textElements || [...currentPage.textElements], imageElements: updates.imageElements || [...currentPage.imageElements] };
      const newHistory = history.slice(0, historyIndex + 1); newHistory.push(newState);
      if (newHistory.length > 50) newHistory.shift();
      setHistory(newHistory); setHistoryIndex(newHistory.length - 1);
    }
  };

  const handleSolve = async () => {
    if (!canvasRef.current || !currentPage || isSolving) return;
    const dataUrl = canvasRef.current.getCanvasImage(); if (!dataUrl) return;
    setIsSolving(true);
    try { setAiResult(await solveHandwriting(dataUrl, false)); } catch (err) { console.error("Solving error:", err); } finally { setIsSolving(false); }
  };

  const handleAutopilotSolve = async () => {
    if (!canvasRef.current || !currentPage || isSolving) return;
    const dataUrl = canvasRef.current.getCanvasImage(); if (!dataUrl) return;
    try {
      const response = await solveHandwriting(dataUrl, true);
      setAutopilotResult(response.autopilot || null);
    } catch (err) { console.error("Autopilot error:", err); }
  };

  const handleCleanDiagram = async () => {
    if (!canvasRef.current || !currentPage || isCleaning) return;
    const dataUrl = canvasRef.current.getCanvasImage(); if (!dataUrl) return;
    setIsCleaning(true);
    try {
      const diagram = await cleanPhysicsDiagram(dataUrl);
      const baseW = 850; const baseH = 1100;
      const newStrokes: Stroke[] = diagram.shapes.map(s => ({
        id: `clean-s-${Date.now()}-${Math.random()}`, points: s.points.map(p => ({ x: (p.x / 1000) * baseW, y: (p.y / 1000) * baseH })),
        color: '#0f172a', width: 2.0, opacity: 1, tool: 'pen', brushType: 'solid', boundingBox: { minX: 0, minY: 0, maxX: 0, maxY: 0 }
      }));
      const newText: TextElement[] = diagram.labels.map(l => ({ id: `clean-t-${Date.now()}-${Math.random()}`, text: l.text, x: l.x, y: l.y, color: '#4f46e5', fontSize: l.fontSize || 14 }));
      updatePage({ strokes: [...currentPage.strokes.filter(s => s.tool === 'highlighter'), ...newStrokes], textElements: [...currentPage.textElements, ...newText] });
    } catch (err) { console.error("Diagram cleaning error:", err); } finally { setIsCleaning(false); }
  };

  const createNotebook = (data: any) => {
    const newId = `${Date.now()}`;
    setNotebooks(prev => [{ id: newId, title: data.title, coverColor: data.color, template: data.template, pages: [{ id: `p-${newId}-1`, strokes: [], textElements: [], imageElements: [], template: data.template }], lastModified: Date.now(), tags: ['Manual'] }, ...prev]);
    setActiveNotebookId(newId); setCurrentPageIndex(0); setView('editor'); setIsNewModalOpen(false); setZoomScale(1.0);
  };

  const handleImportPDF = async (file: File) => {
    setIsProcessingPDF(true);
    try {
      const images = await convertPDFToImages(file);
      const newId = `${Date.now()}`;
      
      const newPages: Page[] = images.map((img, index) => ({
        id: `p-${newId}-${index}`,
        strokes: [],
        textElements: [],
        imageElements: [],
        template: 'blank', // PDF is the background
        backgroundUrl: img.dataUrl
      }));

      const newNotebook: Notebook = {
        id: newId,
        title: file.name.replace('.pdf', ''),
        coverColor: '#ef4444', // Default Red for PDF
        template: 'blank',
        pages: newPages,
        lastModified: Date.now(),
        tags: ['PDF Import']
      };

      setNotebooks(prev => [newNotebook, ...prev]);
      setActiveNotebookId(newId);
      setCurrentPageIndex(0);
      setView('editor');
      setZoomScale(1.0);
    } catch (err) {
      console.error("PDF Import failed", err);
      alert("Failed to import PDF. Please try a different file.");
    } finally {
      setIsProcessingPDF(false);
    }
  };

  if (view === 'dashboard') return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      {(isProcessingPDF) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={48} className="text-indigo-600 animate-spin" />
            <span className="text-sm font-black text-indigo-700 uppercase tracking-widest">Importing PDF Document...</span>
          </div>
        </div>
      )}
      <aside className="bg-white border-r border-slate-200 w-80 flex-shrink-0 hidden lg:flex flex-col z-40 p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-14"><div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-100 transform -rotate-6"><Zap className="text-white" size={24} fill="currentColor" /></div><div><h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">NOTEON</h1><span className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Document Insights</span></div></div>
        <nav className="space-y-2 mb-12"><NavBtn active icon={<LayoutGrid size={20} />} label="Archive" /><NavBtn icon={<Clock size={20} />} label="Recent Solves" /><NavBtn icon={<Star size={20} />} label="Pinned" /><NavBtn icon={<Settings size={20} />} label="Settings" /></nav>
      </aside>
      <Dashboard 
        notebooks={notebooks} 
        onSelectNotebook={(id) => { setActiveNotebookId(id); setCurrentPageIndex(0); setView('editor'); }} 
        onCreateClick={() => setIsNewModalOpen(true)} 
        onImportPDF={handleImportPDF}
      />
      {isNewModalOpen && <NewNotebookModal onClose={() => setIsNewModalOpen(false)} onCreate={createNotebook} />}
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      <aside className={`bg-white border-r border-slate-200 w-80 flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col z-[70] ${isFocusMode ? '-translate-x-full absolute h-full' : (isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full absolute h-full lg:relative lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-none')}`}>
        <div className="p-8 pb-4"><div className="flex items-center justify-between mb-8"><button onClick={() => setView('dashboard')} className="flex items-center gap-3 group"><div className="bg-slate-100 p-2.5 rounded-2xl group-hover:bg-indigo-50 transition-all"><ChevronLeft size={20} /></div><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Archive</span></button></div></div>
        <nav className="flex-1 overflow-y-auto px-6 custom-scrollbar space-y-4 pb-8">{activeNotebook?.pages.map((page, idx) => (
          <div key={page.id} className={`group/item relative flex flex-col gap-2 p-2 rounded-[24px] transition-all border cursor-pointer ${currentPageIndex === idx ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-slate-100 shadow-sm'}`} onClick={() => setCurrentPageIndex(idx)}>
            <div className="aspect-[3/4] bg-slate-200 rounded-[18px] overflow-hidden relative shadow-inner">
               <div className="w-full h-full flex items-center justify-center text-slate-300">
                  {/* If Page has background (PDF), show preview? For now simple icon */}
                  <FileText size={32} />
               </div>
               {page.backgroundUrl && <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: `url(${page.backgroundUrl})` }} />}
            </div>
            <div className="flex items-center justify-between px-2 py-1"><span className={`text-[10px] font-black uppercase ${currentPageIndex === idx ? 'text-indigo-600' : 'text-slate-400'}`}>Page {idx + 1}</span></div>
          </div>
        ))}</nav>
      </aside>
      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0 bg-[#f1f5f9]">
        <header className={`bg-white/95 backdrop-blur-xl border-b border-slate-200 px-6 md:px-10 py-4 flex items-center justify-between z-[60] shadow-sm shrink-0 transition-transform duration-500 ${isFocusMode ? '-translate-y-full absolute w-full' : 'translate-y-0'}`}>
          <div className="flex items-center gap-4 md:gap-8 min-w-0"><button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 hover:bg-slate-100 rounded-xl bg-white border border-slate-200 shadow-sm transition-all shrink-0"><Menu size={20} /></button><div><h2 className="text-base md:text-xl font-black text-slate-900 tracking-tight leading-none truncate">{activeNotebook?.title}</h2></div></div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 mr-2"><button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 hover:bg-white rounded-xl text-slate-500 disabled:opacity-20 transition-all"><Undo2 size={18} /></button><button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-white rounded-xl text-slate-500 disabled:opacity-20 transition-all"><Redo2 size={18} /></button></div>
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200"><button onClick={() => setZoomScale(prev => Math.max(0.1, prev - 0.1))} className="p-2 hover:bg-white rounded-xl text-slate-500 transition-all"><ZoomOut size={16} /></button><span className="px-3 min-w-[55px] text-center text-[10px] font-black text-slate-600">{Math.round(zoomScale * 100)}%</span><button onClick={() => setZoomScale(prev => Math.min(4.0, prev + 0.1))} className="p-2 hover:bg-white rounded-xl text-slate-500 transition-all"><ZoomIn size={16} /></button></div>
            <button onClick={() => setIsAutopilotOn(!isAutopilotOn)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAutopilotOn ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Zap size={14} fill={isAutopilotOn ? "currentColor" : "none"} /> {isAutopilotOn ? 'Autopilot On' : 'Autopilot'}</button>
          </div>
        </header>
        <div className="flex-1 relative overflow-auto custom-scrollbar flex items-start justify-center p-8 md:p-12 lg:p-20 bg-slate-200/50 scroll-smooth">
          {(isAutopilotOn || isSolving || isCleaning) && (
             <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-white/95 backdrop-blur-xl border border-indigo-100 px-6 py-3 rounded-[24px] shadow-2xl shadow-indigo-200 animate-float"><Loader2 size={16} className="text-indigo-600 animate-spin" /><span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">{(isSolving ? 'Solving Complexity...' : (isCleaning ? 'Vectorizing Diagram...' : 'Neural Engine Engaged'))}</span></div>
          )}
          <div className="relative bg-white shadow-[0_40px_80px_-20px_rgba(0,0,0,0.2)] rounded-sm transition-all duration-300 ease-out mx-auto my-auto" style={{ 
            width: `${850 * zoomScale}px`, 
            height: `${1100 * zoomScale}px`, 
            minWidth: `${850 * zoomScale}px`,
            maxWidth: `${850 * zoomScale}px`
          }}>
            {currentPage ? <DrawingCanvas ref={canvasRef} currentTool={currentTool} brushType={toolSettings[currentTool].brushType} color={toolSettings[currentTool].color} strokeSize={toolSettings[currentTool].strokeSize} strokes={currentPage.strokes} textElements={currentPage.textElements} imageElements={currentPage.imageElements || []} autopilotResult={autopilotResult} setStrokes={(data) => updatePage(data)} template={currentPage.template || activeNotebook?.template || 'grid'} zoomScale={zoomScale} smartShapesEnabled={isSmartShapesActive} backgroundUrl={currentPage.backgroundUrl} /> : <div className="w-full h-full flex items-center justify-center bg-slate-50"><Sparkles className="text-slate-200" size={64} /></div>}
          </div>
          <AIResultPanel result={aiResult} onClose={() => setAiResult(null)} />
        </div>
        <Toolbar currentTool={currentTool} setCurrentTool={setCurrentTool} toolSettings={toolSettings} updateToolSettings={updateToolSettings} onClear={() => canvasRef.current?.clear()} onSolve={handleSolve} onCleanDiagram={handleCleanDiagram} onExport={() => { const link = document.createElement('a'); link.download = `markup-${Date.now()}.png`; link.href = canvasRef.current?.getCanvasImage() || ''; link.click(); }} onInsertImage={() => {}} isSolving={isSolving || isCleaning} isSmartShapesActive={isSmartShapesActive} setIsSmartShapesActive={setIsSmartShapesActive} />
      </main>
    </div>
  );
};

export default App;
