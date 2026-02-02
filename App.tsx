
import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Menu, 
  Settings, 
  ChevronLeft, 
  ChevronRight, 
  Layers, 
  Clock, 
  BookOpen,
  Search,
  LayoutGrid,
  FileText,
  MousePointer2,
  FolderOpen,
  Zap,
  Star,
  Share2,
  MoreVertical,
  Sparkles
} from 'lucide-react';
import DrawingCanvas, { CanvasHandle } from './components/DrawingCanvas';
import Toolbar from './components/Toolbar';
import AIResultPanel from './components/AIResultPanel';
import { solveHandwriting } from './services/geminiService';
import { Page, Stroke, ToolType, AIResponse, TextElement } from './types';

const App: React.FC = () => {
  const [pages, setPages] = useState<Page[]>([
    { id: '1', strokes: [], textElements: [], template: 'ruled', title: 'Newtonian Physics', tags: ['Physics', 'Exam Prep'] }
  ]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [currentTool, setCurrentTool] = useState<ToolType>('pen');
  const [color, setColor] = useState('#000000');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [aiResult, setAiResult] = useState<AIResponse | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isAutopilotOn, setIsAutopilotOn] = useState(false);
  const canvasRef = useRef<CanvasHandle>(null);
  
  const autopilotTimerRef = useRef<any>(null);
  const lastProcessedStrokeCount = useRef<number>(0);

  const currentPage = pages[currentPageIndex];

  // Logic for Autopilot Mode
  useEffect(() => {
    if (!isAutopilotOn) return;

    if (autopilotTimerRef.current) clearTimeout(autopilotTimerRef.current);
    
    // Near-instant debounce
    autopilotTimerRef.current = setTimeout(() => {
      // Only trigger if strokes have changed and no selection is active
      if (currentPage.strokes.length > lastProcessedStrokeCount.current) {
        handleSolve(true);
        lastProcessedStrokeCount.current = currentPage.strokes.length;
      }
    }, 1200);

    return () => {
      if (autopilotTimerRef.current) clearTimeout(autopilotTimerRef.current);
    };
  }, [currentPage.strokes, isAutopilotOn]);

  const updatePage = (updates: Partial<Page>) => {
    setPages(prev => prev.map((p, idx) => 
      idx === currentPageIndex ? { ...p, ...updates } : p
    ));
  };

  const toggleTemplate = () => {
    const templates: Page['template'][] = ['blank', 'ruled', 'grid'];
    const currentIndex = templates.indexOf(currentPage.template);
    const nextIndex = (currentIndex + 1) % templates.length;
    updatePage({ template: templates[nextIndex] });
  };

  const handleSolve = async (autopilotOnly: boolean = false) => {
    const dataUrl = canvasRef.current?.getCanvasImage();
    if (!dataUrl) return;

    if (!autopilotOnly) setIsSolving(true);
    
    try {
      const response = await solveHandwriting(dataUrl, autopilotOnly);
      
      if (autopilotOnly) {
        if (response.autopilot && response.autopilot.answer) {
          const newText: TextElement = {
            id: 'auto-' + Date.now(),
            text: response.autopilot.answer,
            x: response.autopilot.x,
            y: response.autopilot.y,
            color: '#4f46e5',
            fontSize: 28 
          };
          
          // Better deduplication check: 
          // 1. Is the answer already present at this location?
          // 2. Is there ANY answer already present at this location?
          const nearExisting = currentPage.textElements.some(te => 
            Math.abs(te.y - newText.y) < 3 && 
            Math.abs(te.x - newText.x) < 8
          );
          
          if (!nearExisting) {
            updatePage({ textElements: [...currentPage.textElements, newText] });
          }
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

  const addPage = () => {
    const newPage: Page = { id: Date.now().toString(), strokes: [], textElements: [], template: 'ruled', title: 'Untitled Note', tags: [] };
    setPages([...pages, newPage]);
    setCurrentPageIndex(pages.length);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <aside className={`bg-white border-r border-slate-200 w-80 flex-shrink-0 transition-all duration-300 flex flex-col z-40 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full absolute h-full'}`}>
        <div className="p-6 pb-2">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
                <Zap className="text-white" size={20} fill="currentColor" />
              </div>
              <h1 className="text-xl font-black text-slate-800 tracking-tighter uppercase italic">NOTEON</h1>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg"><ChevronLeft size={20} /></button>
          </div>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Deep Search STEM notes..." className="w-full bg-slate-100 border-none rounded-2xl py-2.5 pl-10 pr-4 text-xs outline-none placeholder-slate-400 font-medium" />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase mb-3 px-3 flex items-center justify-between">Knowledge Base <Plus size={12} className="cursor-pointer" /></div>
            <div className="space-y-1">
              {['Quantum Mechanics', 'Organic Chemistry', 'Linear Algebra'].map(folder => (
                <button key={folder} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 transition-all group">
                  <FolderOpen size={16} className="text-indigo-500" />
                  <span className="text-sm font-semibold text-slate-700">{folder}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="text-[10px] font-bold text-slate-400 uppercase mb-3 px-3">Active Sheets</div>
            <div className="grid gap-2">
              {pages.map((page, idx) => (
                <button key={page.id} onClick={() => setCurrentPageIndex(idx)} className={`w-full flex flex-col p-4 rounded-2xl transition-all border ${currentPageIndex === idx ? 'bg-indigo-50/50 border-indigo-200' : 'hover:bg-slate-50 border-transparent'}`}>
                  <h4 className={`text-sm font-bold mb-1 truncate ${currentPageIndex === idx ? 'text-indigo-900' : 'text-slate-700'}`}>{page.title || 'Untitled Session'}</h4>
                  <div className="flex gap-1">
                    {page.tags.map(tag => <span key={tag} className="text-[8px] bg-white px-1.5 py-0.5 rounded-md border border-slate-100 text-slate-400 font-bold uppercase">{tag}</span>)}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button onClick={addPage} className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold active:scale-95 shadow-xl shadow-indigo-100"><Plus size={20} /> New Notebook</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative">
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 flex items-center justify-between z-30 sticky top-0">
          <div className="flex items-center gap-6">
            {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-slate-100 rounded-xl"><Menu size={20} /></button>}
            <div>
              <input type="text" value={currentPage.title} onChange={(e) => updatePage({ title: e.target.value })} className="text-lg font-black text-slate-800 bg-transparent border-none p-0 focus:ring-0 w-64 hover:bg-slate-50 rounded-md px-1" />
              <p className="text-[10px] text-slate-400 flex items-center gap-2 font-bold uppercase tracking-wider"><Layers size={10} /> {currentPage.template} mode</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsAutopilotOn(!isAutopilotOn)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAutopilotOn ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 text-slate-500'}`}
            >
              <Zap size={12} fill={isAutopilotOn ? "currentColor" : "none"} />
              Autopilot {isAutopilotOn ? 'ON' : 'OFF'}
            </button>
            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button onClick={toggleTemplate} className="p-2 hover:bg-white rounded-xl"><LayoutGrid size={18} /></button>
              <button className="p-2 hover:bg-white rounded-xl"><Settings size={18} /></button>
            </div>
          </div>
        </header>

        <div className="flex-1 relative bg-slate-50 flex flex-col items-center justify-center p-8 overflow-hidden">
          {isAutopilotOn && (
             <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white/80 backdrop-blur-sm border border-indigo-100 px-4 py-1.5 rounded-full shadow-sm">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">AI Listening for equations...</span>
             </div>
          )}
          <div className="w-full h-full bg-white shadow-2xl rounded-sm border border-slate-200 relative group overflow-hidden max-w-[1200px]">
            <DrawingCanvas 
              ref={canvasRef}
              currentTool={currentTool}
              color={color}
              strokes={currentPage.strokes}
              textElements={currentPage.textElements}
              setStrokes={(data: { strokes: Stroke[]; textElements: TextElement[] }) => {
                updatePage(data);
              }}
              template={currentPage.template}
            />
          </div>
          <AIResultPanel result={aiResult} onClose={() => setAiResult(null)} />
        </div>

        <Toolbar currentTool={currentTool} setCurrentTool={setCurrentTool} color={color} setColor={setColor} onClear={() => canvasRef.current?.clear()} onSolve={() => handleSolve(false)} onExport={() => {}} isSolving={isSolving} />
      </main>
    </div>
  );
};

export default App;
