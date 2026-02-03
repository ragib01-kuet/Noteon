
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
  Redo2,
  Plus,
  BookOpen
} from 'lucide-react';
import DrawingCanvas, { CanvasHandle } from './components/DrawingCanvas';
import Toolbar from './components/Toolbar';
import AIResultPanel from './components/AIResultPanel';
import Dashboard from './components/Dashboard';
import NewNotebookModal from './components/NewNotebookModal';
import SettingsModal from './components/SettingsModal';
import PageThumbnail from './components/PageThumbnail';
import { solveHandwriting, cleanPhysicsDiagram, recognizeHandwriting } from './services/geminiService';
import { loadPDFDocument } from './services/pdfService';
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
  const [dashboardView, setDashboardView] = useState<'all' | 'recent' | 'pinned'>('all');
  
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => {
    try {
      const saved = localStorage.getItem('noteon_notebooks');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      
      return parsed.map((n: any) => ({
        ...n,
        id: n.id || `${Date.now()}-${Math.random()}`,
        pages: (Array.isArray(n.pages) ? n.pages : []).map((p: any) => ({
          ...p,
          strokes: Array.isArray(p.strokes) ? p.strokes : [],
          textElements: Array.isArray(p.textElements) ? p.textElements : [],
          imageElements: Array.isArray(p.imageElements) ? p.imageElements : [],
        }))
      })) as Notebook[];
    } catch (e) { 
      console.warn("Failed to load notebooks", e);
      return []; 
    }
  });
  
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
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

  // --- Notebook Actions ---

  const handleOpenNotebook = (id: string) => {
    setActiveNotebookId(id);
    setCurrentPageIndex(0);
    setView('editor');
    // Update last modified on open to bump "Recent" status
    setNotebooks(prev => prev.map(n => n.id === id ? { ...n, lastModified: Date.now() } : n));
  };

  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotebooks(prev => prev.map(n => n.id === id ? { ...n, isPinned: !n.isPinned } : n));
  };

  const handleDeleteNotebook = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this notebook? This cannot be undone.")) {
      setNotebooks(prev => prev.filter(n => n.id !== id));
      if (activeNotebookId === id) {
        setView('dashboard');
        setActiveNotebookId(null);
      }
    }
  };

  const handleClearAllData = () => {
    localStorage.removeItem('noteon_notebooks');
    setNotebooks([]);
    setView('dashboard');
    setIsSettingsOpen(false);
  };

  // --- Page Actions ---

  const handleAddPage = (insertIndex: number = -1) => {
    if (!activeNotebookId) return;
    const newPageId = `${activeNotebookId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newPage: Page = {
      id: newPageId,
      strokes: [],
      textElements: [],
      imageElements: [],
      template: activeNotebook?.template || 'blank',
    };

    setNotebooks(prev => prev.map(n => {
      if (n.id !== activeNotebookId) return n;
      const newPages = [...n.pages];
      if (insertIndex === -1) {
        newPages.push(newPage);
        setCurrentPageIndex(newPages.length - 1);
      } else {
        newPages.splice(insertIndex + 1, 0, newPage);
        setCurrentPageIndex(insertIndex + 1);
      }
      return { ...n, pages: newPages, lastModified: Date.now() };
    }));
  };

  const handleDeletePage = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!activeNotebookId || !activeNotebook) return;
    
    if (activeNotebook.pages.length <= 1) {
      alert("Notebook must have at least one page.");
      return;
    }
    
    if (confirm("Are you sure you want to delete this page?")) {
      setNotebooks(prev => prev.map(n => {
        if (n.id !== activeNotebookId) return n;
        const newPages = n.pages.filter((_, i) => i !== index);
        return { ...n, pages: newPages, lastModified: Date.now() };
      }));
      
      // Adjust current page index
      if (index < currentPageIndex) {
        // Deleted a page before current, shift left
        setCurrentPageIndex(prev => prev - 1);
      } else if (index === currentPageIndex) {
        // Deleted current page
        if (currentPageIndex === activeNotebook.pages.length - 1) {
          // If was last page, go to new last page
          setCurrentPageIndex(Math.max(0, activeNotebook.pages.length - 2));
        }
        // Else stay at current index (which is now the next page)
      }
    }
  };

  // --- AI & Tools ---

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
      if (response.autopilot && Array.isArray(response.autopilot)) {
        // Convert autopilot answers into persistent TextElements
        const newTextElements: TextElement[] = response.autopilot.map(item => ({
          id: `auto-${Date.now()}-${Math.random()}`,
          text: item.answer,
          // Convert 1000x1000 AI coordinate space to 850x1100 Logical Canvas
          x: (item.x / 1000) * 850,
          y: (item.y / 1000) * 1100,
          color: '#4f46e5', // Indigo 600
          fontSize: 32,
        }));
        
        // Add to page state so they are selectable/editable
        updatePage({ 
          textElements: [...currentPage.textElements, ...newTextElements] 
        });
      }
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

  const handleConvertToText = async () => {
    if (!canvasRef.current || !currentPage || isSolving) return;
    const dataUrl = canvasRef.current.getCanvasImage(); if (!dataUrl) return;
    
    setIsSolving(true);
    try {
      const result = await recognizeHandwriting(dataUrl);
      
      const baseW = 850; 
      const baseH = 1100;
      
      const newTextElements: TextElement[] = result.textBlocks.map(block => ({
        id: `ocr-${Date.now()}-${Math.random()}`,
        text: block.text,
        x: (block.x / 1000) * baseW,
        y: (block.y / 1000) * baseH,
        color: '#1e293b',
        fontSize: 24, // Standard size, could be adaptive if AI returned it
      }));
      
      // Replace strokes with text (but keep highlighters/shapes/images)
      updatePage({
        strokes: currentPage.strokes.filter(s => s.tool !== 'pen' && s.tool !== 'pencil'),
        textElements: [...currentPage.textElements, ...newTextElements]
      });
    } catch (err) {
      console.error("Handwriting recognition error:", err);
      alert("Failed to convert handwriting to text.");
    } finally {
      setIsSolving(false);
    }
  };

  const createNotebook = (data: any) => {
    const newId = `${Date.now()}`;
    setNotebooks(prev => [{ id: newId, title: data.title, coverColor: data.color, template: data.template, pages: [{ id: `p-${newId}-1`, strokes: [], textElements: [], imageElements: [], template: data.template }], lastModified: Date.now(), tags: ['Manual'] }, ...prev]);
    setActiveNotebookId(newId); setCurrentPageIndex(0); setView('editor'); setIsNewModalOpen(false); setZoomScale(1.0);
  };

  const handleImportPDF = async (file: File) => {
    setIsProcessingPDF(true);
    try {
      const { pdfId, numPages, title } = await loadPDFDocument(file);
      const newId = `${Date.now()}`;
      const newPages: Page[] = [];
      for (let i = 1; i <= numPages; i++) {
        newPages.push({
          id: `p-${newId}-${i}`,
          strokes: [], textElements: [], imageElements: [],
          template: 'blank', pdfId: pdfId, pdfPageIndex: i
        });
      }
      const newNotebook: Notebook = {
        id: newId, title: title || 'Imported PDF', coverColor: '#ef4444', template: 'blank', pages: newPages, lastModified: Date.now(), tags: ['PDF Import']
      };
      setNotebooks(prev => [newNotebook, ...prev]);
      setActiveNotebookId(newId); setCurrentPageIndex(0); setView('editor'); setZoomScale(1.0);
    } catch (err) {
      console.error("PDF Import failed", err);
      alert("Failed to import PDF.");
    } finally { setIsProcessingPDF(false); }
  };

  if (view === 'dashboard') return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      {(isProcessingPDF) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={48} className="text-indigo-600 animate-spin" />
            <span className="text-sm font-black text-indigo-700 uppercase tracking-widest">Parsing PDF Document...</span>
          </div>
        </div>
      )}
      
      {/* Sidebar - Integrated into Dashboard Layout */}
      <aside className="bg-white border-r border-slate-200 w-80 flex-shrink-0 hidden lg:flex flex-col z-40 p-8 shadow-sm">
        <div className="flex items-center gap-4 mb-14">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-100 transform -rotate-6">
            <Zap className="text-white" size={24} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tighter uppercase italic leading-none">NOTEON</h1>
            <span className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Document Insights</span>
          </div>
        </div>
        
        <nav className="space-y-2 mb-12">
          <NavBtn active={dashboardView === 'all'} onClick={() => setDashboardView('all')} icon={<LayoutGrid size={20} />} label="Archive" />
          <NavBtn active={dashboardView === 'recent'} onClick={() => setDashboardView('recent')} icon={<Clock size={20} />} label="Recent Activity" />
          <NavBtn active={dashboardView === 'pinned'} onClick={() => setDashboardView('pinned')} icon={<Star size={20} />} label="Pinned" />
          <NavBtn onClick={() => setIsSettingsOpen(true)} icon={<Settings size={20} />} label="Settings" />
        </nav>

        <div className="mt-auto">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Storage Status</p>
            <div className="w-full h-1.5 bg-slate-200 rounded-full mb-2 overflow-hidden">
               <div className="h-full bg-indigo-500 w-[15%] rounded-full"></div>
            </div>
            <p className="text-xs font-bold text-slate-600">{notebooks.length} Notebooks Stored</p>
          </div>
        </div>
      </aside>

      <Dashboard 
        notebooks={notebooks} 
        viewCategory={dashboardView}
        onSelectNotebook={handleOpenNotebook} 
        onCreateClick={() => setIsNewModalOpen(true)} 
        onImportPDF={handleImportPDF}
        onTogglePin={handleTogglePin}
        onDeleteNotebook={handleDeleteNotebook}
      />
      
      {isNewModalOpen && <NewNotebookModal onClose={() => setIsNewModalOpen(false)} onCreate={createNotebook} />}
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} onClearAllData={handleClearAllData} />}
    </div>
  );

  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-900">
      {/* Sidebar with Thumbnails */}
      <aside className={`bg-slate-50 border-r border-slate-200 w-[200px] flex-shrink-0 transition-all duration-300 ease-in-out flex flex-col z-[70] ${isFocusMode ? '-translate-x-full absolute h-full' : (isSidebarOpen ? 'translate-x-0' : '-translate-x-full absolute h-full lg:relative lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-none')}`}>
        <div className="p-6 pb-2">
           <div className="flex items-center justify-between mb-4">
              <button onClick={() => setView('dashboard')} className="flex items-center gap-2 group text-slate-500 hover:text-indigo-600 transition-colors">
                <ChevronLeft size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">Library</span>
              </button>
           </div>
           <h3 className="text-sm font-black text-slate-900 leading-tight mb-6 line-clamp-2">{activeNotebook?.title}</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 custom-scrollbar pb-8 flex flex-col gap-8 items-center">
          {activeNotebook?.pages.map((page, idx) => (
            <PageThumbnail 
              key={page.id}
              page={page}
              pageNumber={idx + 1}
              isActive={currentPageIndex === idx}
              onClick={() => setCurrentPageIndex(idx)}
              onDelete={(e) => handleDeletePage(e, idx)}
              onInsertAfter={(e) => handleAddPage(idx)}
            />
          ))}
          
          <button onClick={() => handleAddPage(activeNotebook?.pages.length ? activeNotebook.pages.length - 1 : -1)} className="w-[140px] py-4 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all gap-2 group">
             <Plus size={24} className="group-hover:scale-110 transition-transform"/>
             <span className="text-[10px] font-black uppercase tracking-widest">Add Page</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden min-w-0 bg-[#f1f5f9]">
        <header className={`bg-white/95 backdrop-blur-xl border-b border-slate-200 px-6 md:px-10 py-4 flex items-center justify-between z-[60] shadow-sm shrink-0 transition-transform duration-500 ${isFocusMode ? '-translate-y-full absolute w-full' : 'translate-y-0'}`}>
          <div className="flex items-center gap-4 md:gap-8 min-w-0"><button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 hover:bg-slate-100 rounded-xl bg-white border border-slate-200 shadow-sm transition-all shrink-0"><Menu size={20} /></button><div><h2 className="text-base md:text-xl font-black text-slate-900 tracking-tight leading-none truncate flex items-center gap-2"><BookOpen size={18} className="text-indigo-600"/> <span className="opacity-40">/</span> Page {currentPageIndex + 1}</h2></div></div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 mr-2"><button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 hover:bg-white rounded-xl text-slate-500 disabled:opacity-20 transition-all"><Undo2 size={18} /></button><button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-white rounded-xl text-slate-500 disabled:opacity-20 transition-all"><Redo2 size={18} /></button></div>
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200"><button onClick={() => setZoomScale(prev => Math.max(0.1, prev - 0.1))} className="p-2 hover:bg-white rounded-xl text-slate-500 transition-all"><ZoomOut size={16} /></button><span className="px-3 min-w-[55px] text-center text-[10px] font-black text-slate-600">{Math.round(zoomScale * 100)}%</span><button onClick={() => setZoomScale(prev => Math.min(4.0, prev + 0.1))} className="p-2 hover:bg-white rounded-xl text-slate-500 transition-all"><ZoomIn size={16} /></button></div>
            <button onClick={() => setIsAutopilotOn(!isAutopilotOn)} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAutopilotOn ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}><Zap size={14} fill={isAutopilotOn ? "currentColor" : "none"} /> {isAutopilotOn ? 'Autopilot On' : 'Autopilot'}</button>
          </div>
        </header>
        <div className="flex-1 relative overflow-auto custom-scrollbar flex items-start justify-center p-8 md:p-12 lg:p-20 bg-slate-200/50 scroll-smooth">
          {(isAutopilotOn || isSolving || isCleaning) && (
             <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-white/95 backdrop-blur-xl border border-indigo-100 px-6 py-3 rounded-[24px] shadow-2xl shadow-indigo-200 animate-float"><Loader2 size={16} className="text-indigo-600 animate-spin" /><span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">{(isSolving ? 'Processing...' : (isCleaning ? 'Vectorizing Diagram...' : 'Neural Engine Engaged'))}</span></div>
          )}
          <div className="relative bg-white shadow-[0_40px_80px_-20px_rgba(0,0,0,0.2)] rounded-sm transition-all duration-300 ease-out mx-auto my-auto" style={{ 
            width: `${850 * zoomScale}px`, 
            height: `${1100 * zoomScale}px`, 
            minWidth: `${850 * zoomScale}px`,
            maxWidth: `${850 * zoomScale}px`
          }}>
            {currentPage ? <DrawingCanvas ref={canvasRef} currentTool={currentTool} brushType={toolSettings[currentTool].brushType} color={toolSettings[currentTool].color} strokeSize={toolSettings[currentTool].strokeSize} strokes={currentPage.strokes} textElements={currentPage.textElements} imageElements={currentPage.imageElements || []} setStrokes={(data) => updatePage(data)} template={currentPage.template || activeNotebook?.template || 'grid'} zoomScale={zoomScale} smartShapesEnabled={isSmartShapesActive} backgroundUrl={currentPage.backgroundUrl} pdfId={currentPage.pdfId} pdfPageIndex={currentPage.pdfPageIndex} /> : <div className="w-full h-full flex items-center justify-center bg-slate-50"><Sparkles className="text-slate-200" size={64} /></div>}
          </div>
          <AIResultPanel result={aiResult} onClose={() => setAiResult(null)} />
        </div>
        <Toolbar currentTool={currentTool} setCurrentTool={setCurrentTool} toolSettings={toolSettings} updateToolSettings={updateToolSettings} onClear={() => canvasRef.current?.clear()} onSolve={handleSolve} onCleanDiagram={handleCleanDiagram} onExport={() => { const link = document.createElement('a'); link.download = `markup-${Date.now()}.png`; link.href = canvasRef.current?.getCanvasImage() || ''; link.click(); }} onConvertToText={handleConvertToText} isSolving={isSolving || isCleaning} isSmartShapesActive={isSmartShapesActive} setIsSmartShapesActive={setIsSmartShapesActive} />
      </main>
    </div>
  );
};

export default App;
