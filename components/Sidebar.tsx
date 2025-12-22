import React from 'react';
import { Menu } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle
}) => {
  return (
    <>
        {/* Mobile Toggle Button (fixed when sidebar is closed) */}
        {!isOpen && (
             <button 
             onClick={onToggle}
             className="fixed top-4 left-4 z-50 p-2 bg-obsidian-border rounded-md text-obsidian-text hover:text-white md:hidden"
           >
             <Menu size={20} />
           </button>
        )}

    <div className={`
      fixed inset-y-0 left-0 z-40 w-72 bg-obsidian-sidebar border-r border-obsidian-border transform transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      md:relative md:translate-x-0 flex flex-col
    `}>
      <div className="p-4 border-b border-obsidian-border flex items-center justify-between">
        <h1 className="text-sm font-bold text-obsidian-muted uppercase tracking-wider flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-obsidian-accent"></span>
          Sidebar
        </h1>
        <button onClick={onToggle} className="md:hidden text-xs text-obsidian-muted hover:text-white">Close</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm text-obsidian-muted">
        Reserved for future tools.
      </div>
      
      <div className="p-4 border-t border-obsidian-border text-xs text-obsidian-muted flex justify-between">
         <span />
         <span />
      </div>
    </div>
    
    {/* Mobile Overlay */}
    {isOpen && (
      <div 
        className="fixed inset-0 bg-black/50 z-30 md:hidden"
        onClick={onToggle}
      />
    )}
    </>
  );
};
