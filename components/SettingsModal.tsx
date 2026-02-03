
import React from 'react';
import { X, User, Moon, Trash2, Shield, Database, LogOut } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
  onClearAllData: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onClearAllData }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 md:p-8 space-y-8">
          {/* Profile Section */}
          <section className="space-y-4">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Account</h3>
             <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                   <User size={24} />
                </div>
                <div>
                   <p className="font-bold text-slate-900">Guest User</p>
                   <p className="text-xs text-slate-500">Local Session Only</p>
                </div>
                <button className="ml-auto text-xs font-bold text-indigo-600 hover:text-indigo-700">Sign In</button>
             </div>
          </section>

          {/* Preferences */}
          <section className="space-y-4">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Preferences</h3>
             
             <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3 text-slate-700 font-medium">
                   <Moon size={18} />
                   <span>Dark Mode</span>
                </div>
                <div className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400 uppercase">System Default</div>
             </div>

             <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3 text-slate-700 font-medium">
                   <Shield size={18} />
                   <span>Privacy Mode</span>
                </div>
                <div className="w-10 h-6 bg-slate-200 rounded-full relative cursor-pointer">
                   <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                </div>
             </div>
          </section>

          {/* Data Management */}
          <section className="space-y-4">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest text-red-400">Danger Zone</h3>
             <button 
               onClick={() => { if(confirm('Delete all notebooks and local data? This cannot be undone.')) onClearAllData(); }}
               className="w-full flex items-center gap-3 p-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl transition-colors text-sm font-bold border border-red-100"
             >
                <Trash2 size={18} />
                <span>Clear All Local Data</span>
             </button>
          </section>
        </div>
        
        <div className="p-6 bg-slate-50 text-center border-t border-slate-100">
           <p className="text-[10px] text-slate-400 font-medium">NoteOn v2.0.0 &bull; Local-First Architecture</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
