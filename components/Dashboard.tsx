
import React, { useRef, useState, useMemo } from 'react';
import { 
  Plus, Book, Clock, Star, MoreVertical, Search, Zap, LayoutGrid, List, FileUp, 
  Trash2, Pin, PinOff, Calendar, FileText
} from 'lucide-react';
import { Notebook } from '../types';

interface DashboardProps {
  notebooks: Notebook[];
  viewCategory: 'all' | 'recent' | 'pinned';
  onSelectNotebook: (id: string) => void;
  onCreateClick: () => void;
  onImportPDF?: (file: File) => void;
  onTogglePin: (id: string, e: React.MouseEvent) => void;
  onDeleteNotebook: (id: string, e: React.MouseEvent) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  notebooks = [], 
  viewCategory,
  onSelectNotebook, 
  onCreateClick, 
  onImportPDF,
  onTogglePin,
  onDeleteNotebook
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  // --- Derived State & Stats ---
  
  const stats = useMemo(() => {
    const totalPages = notebooks.reduce((acc, n) => acc + (n.pages?.length || 0), 0);
    const pinnedCount = notebooks.filter(n => n.isPinned).length;
    const mostRecent = notebooks.sort((a, b) => b.lastModified - a.lastModified)[0];
    
    // Calculate simple "time ago" for most recent
    let timeAgo = "No Activity";
    if (mostRecent) {
      const diff = Date.now() - mostRecent.lastModified;
      const mins = Math.floor(diff / 60000);
      if (mins < 60) timeAgo = `${mins}m ago`;
      else if (mins < 1440) timeAgo = `${Math.floor(mins/60)}h ago`;
      else timeAgo = `${Math.floor(mins/1440)}d ago`;
    }

    return { totalPages, pinnedCount, mostRecent, timeAgo };
  }, [notebooks]);

  const filteredNotebooks = useMemo(() => {
    let filtered = [...notebooks];

    // 1. Filter by Category
    if (viewCategory === 'pinned') {
      filtered = filtered.filter(n => n.isPinned);
    } 
    // "Recent" category typically just means Sort by Date, 
    // but here we can treat it as a filter if desired. 
    // For now we will just use it to enforce default sort.

    // 2. Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(q) || 
        n.tags?.some(t => t.toLowerCase().includes(q))
      );
    }

    // 3. Sort
    filtered.sort((a, b) => {
      if (sortBy === 'date' || viewCategory === 'recent') {
        return b.lastModified - a.lastModified;
      } else {
        return a.title.localeCompare(b.title);
      }
    });

    return filtered;
  }, [notebooks, viewCategory, searchQuery, sortBy]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportPDF) {
      onImportPDF(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex-1 bg-[#f8fafc] overflow-y-auto custom-scrollbar p-6 md:p-12 relative">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 md:mb-12 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-xl shadow-indigo-100 transform -rotate-3">
                <Zap className="text-white" size={24} fill="currentColor" />
              </div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">
                {viewCategory === 'pinned' ? 'Pinned Notes' : viewCategory === 'recent' ? 'Recent Activity' : 'Library'}
              </h1>
            </div>
            <p className="text-slate-500 font-medium text-base md:text-lg">Your intellectual workspace, augmented by AI.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative group hidden sm:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={18} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find a concept or note..." 
                className="w-72 bg-white border border-slate-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-sm font-medium"
              />
            </div>
            
            <input type="file" accept="application/pdf" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2.5 px-6 py-3.5 md:py-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-[22px] font-bold transition-all shadow-sm active:scale-95"
            >
              <FileUp size={20} />
              <span className="hidden lg:inline">Import PDF</span>
            </button>

            <button 
              onClick={onCreateClick}
              className="flex items-center gap-2.5 px-6 md:px-8 py-3.5 md:py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[22px] font-bold transition-all shadow-2xl shadow-indigo-200 active:scale-95 group overflow-hidden relative"
            >
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              <Plus size={22} className="relative z-10 group-hover:rotate-90 transition-transform" /> 
              <span className="relative z-10">New Notebook</span>
            </button>
          </div>
        </header>

        {/* Stats Row */}
        {viewCategory === 'all' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-12 md:mb-16">
            <StatCard 
              icon={<Clock className="text-blue-600" />} 
              label="Last Active" 
              value={stats.timeAgo} 
              color="bg-blue-50" 
              onClick={() => stats.mostRecent && onSelectNotebook(stats.mostRecent.id)}
            />
            <StatCard 
              icon={<Star className="text-amber-500" />} 
              label="Pinned Items" 
              value={`${stats.pinnedCount} Priority`} 
              color="bg-amber-50" 
            />
            <StatCard 
              icon={<Zap className="text-indigo-600" />} 
              label="Total Pages" 
              value={`${stats.totalPages} Pages`} 
              color="bg-indigo-50" 
            />
          </div>
        )}

        {/* Library Grid */}
        <section>
          <div className="flex items-center justify-between mb-8 md:mb-10 border-b border-slate-200 pb-4">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Book size={14} /> 
              {searchQuery ? `Searching "${searchQuery}"` : 'Academic Archive'}
            </h2>
            <div className="flex items-center gap-3">
               <select 
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date'|'name')}
                  className="bg-transparent text-xs font-bold text-slate-500 uppercase tracking-wide outline-none cursor-pointer hover:text-indigo-600"
               >
                  <option value="date">Sort by Date</option>
                  <option value="name">Sort by Name</option>
               </select>
               <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                <button className="p-2 bg-white rounded-lg shadow-sm text-indigo-600"><LayoutGrid size={16} /></button>
                <button className="p-2 text-slate-400 hover:text-slate-600"><List size={16} /></button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 md:gap-10">
            {filteredNotebooks.length === 0 ? (
              <div className="col-span-full py-20 md:py-24 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-[50px] bg-slate-50/50 hover:bg-slate-100/50 transition-colors cursor-pointer group" onClick={onCreateClick}>
                <div className="w-20 h-20 md:w-24 md:h-24 bg-white rounded-[32px] shadow-xl flex items-center justify-center text-slate-200 mb-6 group-hover:scale-110 transition-transform duration-500">
                  <Plus size={48} />
                </div>
                <h3 className="text-xl md:text-2xl font-black text-slate-800 mb-2">Initialize Your Workspace</h3>
                <p className="text-slate-500 font-medium mb-8 px-6 text-center">Start capturing your thoughts with professional-grade tools.</p>
              </div>
            ) : (
              filteredNotebooks.map(notebook => (
                <div 
                  key={notebook.id}
                  onClick={() => onSelectNotebook(notebook.id)}
                  className="group cursor-pointer perspective-1000 relative"
                >
                  <div className="relative aspect-[3/4] bg-white rounded-[36px] shadow-sm border border-slate-200 overflow-hidden transition-all duration-500 group-hover:-translate-y-4 group-hover:shadow-[0_40px_80px_-20px_rgba(79,70,229,0.15)] group-hover:border-indigo-100">
                    {/* Spine Effect */}
                    <div className="absolute left-0 top-0 bottom-0 w-8 bg-black/[0.03] z-10 border-r border-black/[0.05]"></div>
                    <div className="absolute top-0 right-0 left-0 h-40 opacity-10 blur-3xl transform -rotate-12 translate-y-[-20%]" style={{ backgroundColor: notebook.coverColor || '#4f46e5' }}></div>
                    
                    <div className="p-8 md:p-10 pt-12 md:pt-14 flex flex-col h-full relative z-20">
                      <div className="flex items-start justify-between mb-6 md:mb-8">
                         <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-white shadow-2xl transition-transform group-hover:rotate-12" style={{ backgroundColor: notebook.coverColor || '#4f46e5' }}>
                            <Book size={24} />
                         </div>
                         {notebook.isPinned && <Star size={16} className="text-amber-400 fill-amber-400" />}
                      </div>
                      
                      <h3 className="text-xl md:text-2xl font-black text-slate-900 leading-[1.1] mb-3 group-hover:text-indigo-600 transition-colors truncate">
                        {notebook.title || 'Untitled'}
                      </h3>
                      
                      <div className="flex items-center gap-2 mb-4 md:mb-6">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                          {(notebook.pages || []).length} Pages
                        </span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                          {notebook.template || 'grid'}
                        </span>
                      </div>
                      
                      <div className="mt-auto flex flex-wrap gap-2">
                        {(notebook.tags || []).map(tag => (
                          <span key={tag} className="px-3 py-1 bg-slate-100 text-[9px] font-black text-slate-500 rounded-lg uppercase tracking-wider group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">#{tag}</span>
                        ))}
                      </div>
                    </div>

                    {/* Quick Actions Overlay (Visible on Hover) */}
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-30 pointer-events-none">
                       {/* We need pointer-events-auto on buttons only */}
                       <button onClick={(e) => onTogglePin(notebook.id, e)} className="pointer-events-auto p-3 bg-white text-amber-500 rounded-full shadow-lg hover:scale-110 transition-transform" title={notebook.isPinned ? "Unpin" : "Pin"}>
                          {notebook.isPinned ? <PinOff size={18} /> : <Pin size={18} />}
                       </button>
                       <button onClick={(e) => onDeleteNotebook(notebook.id, e)} className="pointer-events-auto p-3 bg-white text-red-500 rounded-full shadow-lg hover:scale-110 transition-transform" title="Delete">
                          <Trash2 size={18} />
                       </button>
                    </div>
                  </div>
                  
                  <div className="mt-4 px-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                    <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                      <Calendar size={10} /> 
                      {notebook.lastModified ? new Date(notebook.lastModified).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, color, onClick }: { icon: React.ReactNode, label: string, value: string, color: string, onClick?: () => void }) => (
  <div onClick={onClick} className={`bg-white p-6 md:p-7 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-4 md:gap-6 group hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50 transition-all ${onClick ? 'cursor-pointer' : ''}`}>
    <div className={`p-3 md:p-4 rounded-2xl ${color} transition-all group-hover:scale-110 duration-300`}>
      {React.cloneElement(icon as React.ReactElement<any>, { size: 24 })}
    </div>
    <div>
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] mb-0.5">{label}</p>
      <p className="text-xl md:text-2xl font-black text-slate-900 leading-none">{value}</p>
    </div>
  </div>
);

export default Dashboard;
