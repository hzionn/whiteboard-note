'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { createMarkdownExtensions, useAppTheme } from '@/features/editor/lib/markdownExtensions';
import { Sparkles } from 'lucide-react';
import { generateCompletion } from '@/features/ai/services/geminiService';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  title: string;
  onTitleChange: (title: string) => void;
  variant?: 'full' | 'embedded';
}

export const Editor: React.FC<EditorProps> = React.memo(
  ({ content, onChange, title, onTitleChange, variant = 'full' }) => {
    const showTitleInput = variant !== 'embedded';
    const appTheme = useAppTheme();
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // Never steal focus on mount: only select the title if the user already focused it.
    const titleInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
      if (!showTitleInput) return;
      const el = titleInputRef.current;
      if (!el) return;
      if (document.activeElement !== el) return;
      if (title === 'Untitled Note') el.select();
    }, [title, showTitleInput]);

    const handleAiAction = async (type: 'continue' | 'summarize' | 'improve') => {
      if (!content) return;
      setIsAiLoading(true);
      setAiError(null);

      try {
        const result = await generateCompletion(content, content, type);

        if (type === 'continue') {
          const newContent = content + (content.endsWith(' ') ? '' : ' ') + result;
          onChange(newContent);
        } else if (type === 'summarize') {
          const newContent = content + `\n\n### AI Summary\n${result}`;
          onChange(newContent);
        } else if (type === 'improve') {
          onChange(result);
        }
      } catch (err) {
        setAiError('Failed to generate AI response.');
      } finally {
        setIsAiLoading(false);
      }
    };

    // Extensions for CodeMirror (memoized to avoid expensive reconfigure)
    const extensions = useMemo(() => {
      return createMarkdownExtensions({ appTheme, variant, editable: true });
    }, [variant, appTheme]);

    return (
      <div className="flex flex-col h-full bg-obsidian-bg relative">
        {/* Top Bar (full editor only) */}
        {variant === 'full' && (
          <div className="flex items-center justify-between px-8 py-6 pb-2 shrink-0">
            {showTitleInput && (
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                className="bg-transparent text-3xl font-bold text-obsidian-text placeholder-obsidian-muted focus:outline-none w-full"
                placeholder="Note Title"
              />
            )}

            <div className="flex items-center gap-2">
              {isAiLoading ? (
                <div className="flex items-center gap-2 text-obsidian-accent text-sm animate-pulse">
                  <Sparkles size={16} />
                  <span>Thinking...</span>
                </div>
              ) : (
                <div className="relative group">
                  <button
                    className="p-2 text-obsidian-muted hover:text-obsidian-accent transition-colors rounded hover:bg-obsidian-active"
                    title="AI Assistant"
                  >
                    <Sparkles size={20} />
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-obsidian-sidebar border border-obsidian-border rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 transform origin-top-right">
                    <div className="py-1">
                      <button
                        onClick={() => handleAiAction('continue')}
                        className="block w-full text-left px-4 py-2 text-sm text-obsidian-text hover:bg-obsidian-accent hover:text-obsidian-strong"
                      >
                        Continue Writing
                      </button>
                      <button
                        onClick={() => handleAiAction('summarize')}
                        className="block w-full text-left px-4 py-2 text-sm text-obsidian-text hover:bg-obsidian-accent hover:text-obsidian-strong"
                      >
                        Summarize Note
                      </button>
                      <button
                        onClick={() => handleAiAction('improve')}
                        className="block w-full text-left px-4 py-2 text-sm text-obsidian-text hover:bg-obsidian-accent hover:text-obsidian-strong"
                      >
                        Fix Grammar & Tone
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI control for embedded notes is rendered by the note header */}

        {aiError && (
          <div
            className={
              variant === 'embedded'
                ? 'absolute top-12 right-2 z-30 text-red-400 text-xs bg-obsidian-bg/80 backdrop-blur px-2 py-1 rounded border border-obsidian-border flex items-center gap-2'
                : 'px-8 py-2 text-red-400 text-sm flex items-center gap-2'
            }
          >
            <span>⚠️ {aiError}</span>
            <button onClick={() => setAiError(null)} className="underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Editor Area */}
        <div className="flex-1 overflow-hidden relative">
          <CodeMirror
            value={content}
            height="100%"
            extensions={extensions}
            onChange={onChange}
            autoFocus={variant === 'full'}
            className="text-lg h-full"
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              history: true,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: true,
              crosshairCursor: true,
              highlightSelectionMatches: true,
              closeBracketsKeymap: true,
              defaultKeymap: true,
              searchKeymap: true,
              historyKeymap: true,
              foldKeymap: true,
              completionKeymap: true,
              lintKeymap: true,
            }}
          />
        </div>

        {/* Status Bar */}
        {variant === 'full' && (
          <div className="h-8 bg-obsidian-sidebar border-t border-obsidian-border flex items-center justify-end px-4 text-xs text-obsidian-muted select-none shrink-0">
            <span className="mr-4">{content.length} characters</span>
            <span>{content.split(/\s+/).filter((w) => w.length > 0).length} words</span>
          </div>
        )}
      </div>
    );
  }
);

Editor.displayName = 'Editor';
