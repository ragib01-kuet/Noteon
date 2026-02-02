
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Menu, 
  ChevronLeft, 
  Layers, 
  Zap,
  MoreVertical,
  Clock,
  Star,
  FileText,
  LayoutGrid,
  Download,
  Settings,
  LogOut,
  Sparkles,
  X,
  Maximize2,
  Minimize2,
  Copy,
  Trash2,
  GripVertical
} from 'lucide-react';
import DrawingCanvas, { CanvasHandle } from './components/DrawingCanvas';
import Toolbar from './components/Toolbar';
import AIResultPanel from './components/AIResultPanel';
import Dashboard from './components/Dashboard';
import NewNotebookModal from './components/NewNotebookModal';
import { solveHandwriting } from './services/geminiService';
import { Page, Stroke, ToolType, AIResponse, TextElement, Notebook, ImageElement } from './types';

const App: React.FC = () => {
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
    try {
      const saved = localStorage.getItem('noteon_notebooks');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load notebooks", e);
      return [];
    }
  });
  
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#0f172a');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isAutopilotOn, setIsAutopilotOn] = useState(false);
  
  const canvasRef = useRef<CanvasHandle>(null);
  const autopilotTimerRef = useRef<any>(null);
  const lastProcessedStrokeCount = useRef<number>(0);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const activeNotebook = useMemo(() => 
    notebooks.find(n => n.id === activeNotebookId), 
  [notebooks, activeNotebookId]);

  const currentPage = useMemo(() => 
    activeNotebook?.pages[currentPageIndex], 
  [activeNotebook, currentPageIndex]);

  useEffect(() => {
    localStorage.setItem('noteon_notebooks', JSON.stringify(notebooks));
  }, [notebooks]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setIsSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    lastProcessedStrokeCount.current = currentPage?.strokes.length || 0;
  }, [activeNotebookId, currentPageIndex]);

  useEffect(() => {
    if (!isAutopilotOn || !currentPage || view !== 'editor') return;
    if (autopilotTimerRef.current) clearTimeout(autopilotTimerRef.current);
    if (currentPage.strokes.length > lastProcessedStrokeCount.current) {
      autopilotTimerRef.current = setTimeout(() => {
        handleSolve(true);
      }, 3000); 
    }
    return () => clearTimeout(autopilotTimerRef.current);
  }, [currentPage?.strokes, isAutopilotOn, view]);

  const updatePage = (updates: Partial<Page>) => {
    if (!activeNotebookId) return;
    setNotebooks(prev => prev.map(n => {
      if (n.id !== activeNotebookId) return n;
      const updatedPages = n.pages.map((p, idx) => 
        idx === currentPageIndex ? { ...p, ...updates } : p
      );
      return { ...n, pages: updatedPages, lastModified: Date.now() };
    }));
  };

  const createNotebook = (data: { title: string; color: string; template: 'blank' | 'ruled' | 'grid' }) => {
    const newId = Date.now().toString();
    const newNotebook: Notebook = {
      id: newId,
      title: data.title,
      coverColor: data.color,
      template: data.template,
      pages: [{ id: 'page-' + newId, strokes: [], textElements: [], imageElements: [], template: data.template }],
      lastModified: Date.now(),
      tags: ['Academic']
    };
    setNotebooks(prev => [newNotebook, ...prev]);
    setActiveNotebookId(newId);
    setCurrentPageIndex(0);
    setView('editor');
    setIsNewModalOpen(false);
    setIsFocusMode(false);
  };

  const addNewPage = () => {
    if (!activeNotebookId) return;
    const newPage: Page = { id: 'page-' + Date.now(), strokes: [], textElements: [], imageElements: [], template: activeNotebook?.template || 'grid' };
    setNotebooks(prev => prev.map(n => n.id === activeNotebookId ? { ...n, pages: [...n.pages, newPage] } : n));
    setCurrentPageIndex(activeNotebook!.pages.length);
  };

  const insertImage = (dataUrl: string) => {
    if (!currentPage) return;
    const newImage: ImageElement = {
      id: 'img-' + Date.now(),
      dataUrl,
      x: 10,
      y: 10,
      width: 30,
      height: 30
    };
    updatePage({ imageElements: [...(currentPage.imageElements || []), newImage] });
  };

  const duplicatePage = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeNotebookId || !activeNotebook) return;
    const pageToCopy = activeNotebook.pages[idx];
    const newPage: Page = { 
      ...pageToCopy, 
      id: 'page-' + Date.now(),
      strokes: [...pageToCopy.strokes.map(s => ({ ...s }))],
      textElements: [...pageToCopy.textElements.map(t => ({ ...t }))],
      imageElements: [...(pageToCopy.imageElements || []).map(i => ({ ...i }))]
    };
    const newPages = [...activeNotebook.pages];
    newPages.splice(idx + 1, 0, newPage);
    setNotebooks(prev => prev.map(n => n.id === activeNotebookId ? { ...n, pages: newPages } : n));
    setCurrentPageIndex(idx + 1);
  };

  const deletePage = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeNotebookId || !activeNotebook || activeNotebook.pages.length <= 1) return;
    const newPages = activeNotebook.pages.filter((_, i) => i !== idx);
    setNotebooks(prev => prev.map(n => n.id === activeNotebookId ? { ...n, pages: newPages } : n));
    if (currentPageIndex >= newPages.length) {
      setCurrentPageIndex(newPages.length - 1);
    }
  };

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const newPages = [...activeNotebook!.pages];
      const draggedItemContent = newPages[dragItem.current];
      newPages.splice(dragItem.current, 1);
      newPages.splice(dragOverItem.current, 0, draggedItemContent);
      setNotebooks(prev => prev.map(n => n.id === activeNotebookId ? { ...n, pages: newPages } : n));
      if (currentPageIndex === dragItem.current) setCurrentPageIndex(dragOverItem.current);
      else if (currentPageIndex > dragItem.current && currentPageIndex <= dragOverItem.current) setCurrentPageIndex(currentPageIndex - 1);
      else if (currentPageIndex < dragItem.current && currentPageIndex >= dragOverItem.current) setCurrentPageIndex(currentPageIndex + 1);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleSolve = async (autopilotOnly: boolean = false) => {
    if (!canvasRef.current || !currentPage || isSolving) return;
    const dataUrl = canvasRef.current.getCanvasImage();
    if (!dataUrl) return;
    if (!autopilotOnly) setIsSolving(true);
    try {
      const currentCount = currentPage.strokes.length;
      const response = await solveHandwriting(dataUrl, autopilotOnly);
      lastProcessedStrokeCount.current = currentCount;
      if (autopilotOnly) {
        if (response.autopilot && response.autopilot.answer) {
          const newText: TextElement = {
            id: 'auto-' + Date.now(),
            text: response.autopilot.answer,
            x: response.autopilot.x,
            y: response.autopilot.y,
            color: activeNotebook?.coverColor || '#6366f1',
            fontSize: 22 
          };
          const nearExisting = currentPage.textElements.some(te => 
            Math.abs(te.y - newText.y) < 4 && Math.abs(te.x - newText.x) < 10
          );
          if (!nearExisting) updatePage({ textElements: [...currentPage.textElements, newText] });
        }
      } else {
        setAiResult(response);
      }
    } catch (err) {
      if (!autopilotOnly) console.error("Solve error:", err);
    } finally {
      if (!autopilotOnly) setIsSolving(false);
    }
  };

  const exportCurrentPage = () => {
    const dataUrl = canvasRef.current?.getCanvasImage();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `${activeNotebook?.title || 'Note'}-Section${currentPageIndex + 1}.png`;
    link.href = dataUrl;
    link.click();
  };

  if (view === 'dashboard') {
    return (
      <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
        <aside className="bg-white border-r border-slate-200 w-80 flex-shrink-0 hidden lg:flex flex-col z-40 p-8 shadow-sm">
          <div className="flex items-center gap-4 mb-14">
            <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-100 transform -rotate-6">
              <Zap className="text-white" size={24} fill="currentColor" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">NOTEON</h1>
              <span className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Academic Neural Ink</span>
            </div>
          </div>
          <nav className="space-y-2 mb-12">
            <NavBtn active icon={<LayoutGrid size={20} />} label="My Library" />
            <NavBtn icon={<Clock size={20} />} label="Recent Solves" />
            <NavBtn icon={<Star size={20} />} label="Pinned Units" />
            <NavBtn icon={<Settings size={20} />} label="Workspace Config" />
          </nav>
          <div className="mt-auto space-y-6">
             <div className="p-6 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[32px] text-white relative overflow-hidden group shadow-2xl shadow-indigo-200 cursor-pointer">
               <div className="relative z-10">
                 <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">Neural Tier</p>
                 <p className="text-xl font-black mb-6 leading-tight">Pro Scholar Access</p>
                 <button className="w-full py-3 bg-white text-indigo-700 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-transform active:scale-95">Upgrade</button>
               </div>
               <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-150 transition-transform duration-1000"><Zap size={140} fill="currentColor" /></div>
             </div>
             <button className="flex items-center gap-3 px-4 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-red-500 transition-colors"><LogOut size={16} /> Logout Session</button>
          </div>
        </aside>
        <Dashboard notebooks={notebooks} onSelectNotebook={(id) => { setActiveNotebookId(id); setCurrentPageIndex(0); setView('editor'); }} onCreateClick={() => setIsNewModalOpen(true)} />
        {isNewModalOpen && <NewNotebookModal onClose={() => setIsNewModalOpen(false)} onCreate={createNotebook} />}
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-900 transition-all duration-500`}>
      {isSidebarOpen && window.innerWidth < 1024 && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[65] lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}
      <aside className={`bg-white border-r border-slate-200 w-80 flex-shrink-0 transition-all duration-500 ease-in-out flex flex-col z-[70] 
        ${isFocusMode ? '-translate-x-full absolute h-full' : (isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full absolute h-full lg:relative lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-none')}`}>
        <div className="p-8">
          <div className="flex items-center justify-between mb-10">
            <button onClick={() => setView('dashboard')} className="flex items-center gap-3 group">
              <div className="bg-slate-100 p-2.5 rounded-2xl group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all"><ChevronLeft size={20} /></div>
              <span className="text-xs font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-900">Library</span>
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors lg:hidden"><X size={20} /></button>
          </div>
          <div className="mb-6">
            <div className="w-full aspect-video rounded-[28px] mb-6 relative overflow-hidden group shadow-lg" style={{ backgroundColor: activeNotebook?.coverColor || '#4f46e5' }}>
               <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors"></div>
               <div className="p-6 relative h-full flex flex-col justify-end">
                 <h2 className="text-white font-black text-xl truncate leading-tight">{activeNotebook?.title}</h2>
               </div>
            </div>
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pages ({activeNotebook?.pages.length})</span>
              <button onClick={addNewPage} className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1" title="Add Page"><Plus size={14} /></button>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-6 custom-scrollbar space-y-2 pb-8">
          {activeNotebook?.pages.map((page, idx) => (
            <div key={page.id} draggable onDragStart={() => handleDragStart(idx)} onDragEnter={() => handleDragEnter(idx)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()}
              className={`group/item relative flex items-center gap-3 p-3 rounded-[20px] transition-all border cursor-pointer ${currentPageIndex === idx ? 'bg-indigo-50/50 border-indigo-100 shadow-sm' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
              onClick={() => { setCurrentPageIndex(idx); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}>
              <div className="text-slate-300 opacity-0 group-hover/item:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"><GripVertical size={14} /></div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${currentPageIndex === idx ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}><FileText size={14} /></div>
              <div className="text-left flex-1 min-w-0"><h4 className={`text-xs font-bold truncate ${currentPageIndex === idx ? 'text-slate-900' : 'text-slate-500'}`}>Page {idx + 1}</h4></div>
              <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                <button onClick={(e) => duplicatePage(idx, e)} className="p-1.5 hover:bg-white rounded-md text-slate-400 hover:text-indigo-600 shadow-sm" title="Duplicate"><Copy size={12} /></button>
                <button onClick={(e) => deletePage(idx, e)} disabled={activeNotebook.pages.length <= 1} className="p-1.5 hover:bg-white rounded-md text-slate-400 hover:text-red-500 shadow-sm disabled:opacity-30" title="Delete"><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0">
        <header className={`bg-white/90 backdrop-blur-xl border-b border-slate-200 px-4 md:px-10 py-4 md:py-5 flex items-center justify-between z-30 shadow-sm shrink-0 transition-transform duration-500 ${isFocusMode ? '-translate-y-full absolute w-full' : 'translate-y-0'}`}>
          <div className="flex items-center gap-3 md:gap-8 min-w-0">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-3 hover:bg-slate-100 rounded-2xl bg-white border border-slate-200 shadow-sm transition-all shrink-0 ${isFocusMode ? 'hidden' : 'block'}`}><Menu size={22} /></button>
            <div className="min-w-0">
              <h2 className="text-lg md:text-2xl font-black text-slate-900 tracking-tight leading-none mb-1 truncate">{activeNotebook?.title}</h2>
              <div className="flex items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar">
                <span className="text-[9px] md:text-[10px] text-slate-400 flex items-center gap-2 font-black uppercase tracking-[0.15em] bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100 whitespace-nowrap"><Layers size={12} /> {currentPage?.template}</span>
                <span className="text-[9px] md:text-[10px] text-indigo-500 flex items-center gap-2 font-black uppercase tracking-[0.15em] bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100 whitespace-nowrap"><Clock size={12} /> Live Sync</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-5 shrink-0 ml-2">
            <button onClick={() => setIsFocusMode(true)} className="flex items-center gap-2 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm hidden sm:flex"><Maximize2 size={14} /> Focus Mode</button>
            <button onClick={() => setIsAutopilotOn(!isAutopilotOn)} className={`flex items-center gap-2.5 px-3.5 md:px-6 py-2.5 md:py-3.5 rounded-[22px] text-[10px] md:text-xs font-black uppercase tracking-[0.1em] transition-all relative overflow-hidden group ${isAutopilotOn ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-100' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}>
              <Zap size={16} fill={isAutopilotOn ? "currentColor" : "none"} className={isAutopilotOn ? 'animate-pulse' : 'group-hover:text-indigo-500 transition-colors'} /><span className="hidden sm:inline">Autopilot {isAutopilotOn ? 'Active' : 'Standby'}</span>
            </button>
            <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
            <div className="flex items-center gap-1">
              <button onClick={exportCurrentPage} className="p-2.5 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all hover:text-indigo-600" title="Export Design"><Download size={20} /></button>
              <button className="p-2.5 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all"><MoreVertical size={20} /></button>
            </div>
          </div>
        </header>
        {isFocusMode && (
          <button onClick={() => setIsFocusMode(false)} className="fixed top-8 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 px-6 py-3 bg-slate-900 text-white rounded-full shadow-2xl opacity-40 hover:opacity-100 transition-opacity border border-white/10"><Minimize2 size={18} /><span className="text-xs font-bold uppercase tracking-widest">Exit Focus Mode</span></button>
        )}
        <div className={`flex-1 relative p-4 md:p-8 lg:p-12 overflow-hidden flex flex-col items-center transition-all duration-500`}>
          {(isAutopilotOn || isSolving) && (
             <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 bg-white/95 backdrop-blur-xl border border-indigo-100 px-5 md:px-6 py-2 md:py-2.5 rounded-[24px] shadow-2xl shadow-indigo-100 animate-float">
                <div className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600"></span></div>
                <span className="text-[10px] md:text-[11px] font-black text-indigo-700 uppercase tracking-[0.2em] whitespace-nowrap">{isSolving ? 'Solving Complexity...' : 'Neural Scan Active'}</span>
             </div>
          )}
          <div className={`w-full h-full max-w-7xl bg-white shadow-[0_40px_80px_-20px_rgba(0,0,0,0.1)] rounded-[32px] md:rounded-[50px] border border-slate-200 relative overflow-hidden paper-texture transition-all duration-500 ${isFocusMode ? 'border-none shadow-none rounded-none max-w-none w-full h-full' : ''}`}>
            {currentPage ? (
              <DrawingCanvas 
                ref={canvasRef}
                currentTool={currentTool}
                color={color}
                strokes={currentPage.strokes}
                textElements={currentPage.textElements}
                imageElements={currentPage.imageElements || []}
                setStrokes={(data) => updatePage(data)}
                template={currentPage.template}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-50"><div className="text-center"><div className="p-6 bg-white rounded-full inline-block shadow-lg mb-4 text-slate-200"><Sparkles size={48} /></div><h3 className="text-lg font-black text-slate-800">Ready to start?</h3></div></div>
            )}
          </div>
          <AIResultPanel result={aiResult} onClose={() => setAiResult(null)} />
        </div>
        <Toolbar currentTool={currentTool} setCurrentTool={setCurrentTool} color={color} setColor={setColor} onClear={() => canvasRef.current?.clear()} onSolve={() => handleSolve(false)} onExport={exportCurrentPage} onInsertImage={insertImage} isSolving={isSolving} />
      </main>
    </div>
  );
};

const NavBtn = ({ active, icon, label }: { active?: boolean, icon: React.ReactNode, label: string }) => (
  <button className={`w-full flex items-center gap-4 px-5 py-4 rounded-[22px] font-black text-sm transition-all group ${active ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><span className={active ? 'text-white' : 'text-slate-400 group-hover:text-indigo-600 transition-colors'}>{icon}</span>{label}</button>
);

export default App;
