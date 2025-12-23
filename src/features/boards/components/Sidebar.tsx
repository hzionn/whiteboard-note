'use client';

import React from 'react';
import { Menu, Plus, Trash2 } from 'lucide-react';
import { WhiteboardBoard } from '@/shared/types';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  boards: WhiteboardBoard[];
  activeBoardId: string | null;
  onCreateBoard: () => void;
  onSelectBoard: (boardId: string) => void;
  onDeleteBoard: (boardId: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  boards,
  activeBoardId,
  onCreateBoard,
  onSelectBoard,
  onDeleteBoard,
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

      <div
        className={`
      fixed inset-y-0 left-0 z-40 w-72 bg-obsidian-sidebar border-r border-obsidian-border transform transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      md:relative md:translate-x-0 flex flex-col
    `}
      >
        <div className="p-4 border-b border-obsidian-border flex items-center justify-between">
          <h1 className="text-sm font-bold text-obsidian-muted uppercase tracking-wider flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-obsidian-accent"></span>
            Whiteboards
          </h1>
          <button
            onClick={onToggle}
            className="md:hidden text-xs text-obsidian-muted hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-xs text-obsidian-muted uppercase tracking-wider">Your boards</div>
            <button
              onClick={onCreateBoard}
              className="p-2 rounded bg-obsidian-bg hover:bg-obsidian-active text-obsidian-text border border-obsidian-border"
              title="New whiteboard"
            >
              <Plus size={16} />
            </button>
          </div>

          {boards.length === 0 ? (
            <div className="text-sm text-obsidian-muted">No whiteboards yet.</div>
          ) : (
            <ul className="space-y-1">
              {boards.map((b) => (
                <li key={b.id}>
                  <div
                    className={
                      'w-full px-3 py-2 rounded text-sm border border-transparent flex items-center gap-2 ' +
                      (b.id === activeBoardId
                        ? 'bg-obsidian-active text-white border-obsidian-border'
                        : 'text-obsidian-text hover:bg-obsidian-bg')
                    }
                  >
                    <button
                      onClick={() => onSelectBoard(b.id)}
                      className="min-w-0 flex-1 text-left"
                      title={b.name}
                    >
                      <span className="truncate block">{b.name || 'Untitled Whiteboard'}</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBoard(b.id);
                      }}
                      className={
                        'shrink-0 p-1 rounded hover:bg-black/10 ' +
                        (b.id === activeBoardId
                          ? 'text-white/80 hover:text-red-200'
                          : 'text-obsidian-muted hover:text-red-400')
                      }
                      title="Delete whiteboard"
                      aria-label={`Delete ${b.name || 'whiteboard'}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-obsidian-border text-xs text-obsidian-muted flex justify-between">
          <span />
          <span />
        </div>
      </div>

      {/* Mobile Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={onToggle} />}
    </>
  );
};
