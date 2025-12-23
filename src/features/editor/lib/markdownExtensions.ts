'use client';

import { cursorLineUp } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Prec, Range } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  keymap,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import katex from 'katex';
import { useEffect, useState } from 'react';

export type AppTheme = 'dark' | 'light';
export type MarkdownViewVariant = 'full' | 'embedded' | 'chat';

export const useAppTheme = (): AppTheme => {
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      setAppTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
    };
    read();
    const obs = new MutationObserver(() => read());
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return appTheme;
};

const safeNormalizeUrl = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip common trailing punctuation that often follows URLs in prose.
  const withoutTrailing = trimmed.replace(/[\]\)\}\>\.,;:!?]+$/g, '');
  if (!withoutTrailing) return null;

  const candidate = withoutTrailing.startsWith('www.')
    ? `https://${withoutTrailing}`
    : withoutTrailing;
  const lower = candidate.toLowerCase();

  // Only allow protocols we actually want to open.
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:'))
    return candidate;
  return null;
};

const extractUrlAtPos = (view: EditorView, pos: number) => {
  const line = view.state.doc.lineAt(pos);
  const offset = pos - line.from;
  const text = line.text;

  // Match standard markdown links: [label](url "optional title")
  // We intentionally keep this conservative (single-line).
  const mdLink = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (let m = mdLink.exec(text); m; m = mdLink.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    if (offset >= start && offset <= end) {
      return safeNormalizeUrl(m[1]);
    }
  }

  // Match bare URLs in text.
  const bareUrl = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)/g;
  for (let m = bareUrl.exec(text); m; m = bareUrl.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    if (offset >= start && offset <= end) {
      return safeNormalizeUrl(m[0]);
    }
  }

  // Match autolinks like <https://example.com>
  const autoLink = /<\s*(https?:\/\/[^\s>]+)\s*>/g;
  for (let m = autoLink.exec(text); m; m = autoLink.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    if (offset >= start && offset <= end) {
      return safeNormalizeUrl(m[1]);
    }
  }

  return null;
};

const openLinkOnModClickPlugin = ViewPlugin.fromClass(
  class {
    private view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      // Capture phase so we beat CodeMirror's built-in Mod+Click multi-cursor behavior.
      view.dom.addEventListener('mousedown', this.onMouseDown, true);
    }

    private onMouseDown = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (!(e.metaKey || e.ctrlKey)) return;

      // Only consume the event if we're actually on a link.
      const coords = { x: e.clientX, y: e.clientY };
      const pos = this.view.posAtCoords(coords);
      if (pos == null) return;

      const url = extractUrlAtPos(this.view, pos);
      if (!url) return;

      // Prevent CodeMirror from treating Mod+Click as add-cursor.
      e.preventDefault();
      e.stopPropagation();
      // stopImmediatePropagation is important here because CodeMirror attaches
      // its own handlers on the same element.
      (e as any).stopImmediatePropagation?.();

      window.open(url, '_blank', 'noopener,noreferrer');
    };

    destroy() {
      this.view.dom.removeEventListener('mousedown', this.onMouseDown, true);
    }
  }
);

// Comprehensive Theme for whiteboard-note-like styling
const markdownThemeDark = HighlightStyle.define([
  // Headings
  {
    tag: tags.heading1,
    fontSize: '2.2em',
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: '1.2',
    marginTop: '1em',
    marginBottom: '0.5em',
  },
  {
    tag: tags.heading2,
    fontSize: '1.8em',
    fontWeight: '600',
    color: '#f0f0f0',
    marginTop: '1em',
    marginBottom: '0.5em',
  },
  {
    tag: tags.heading3,
    fontSize: '1.5em',
    fontWeight: '600',
    color: '#e0e0e0',
    marginTop: '0.8em',
  },
  { tag: tags.heading4, fontSize: '1.25em', fontWeight: '600', color: '#d0d0d0' },
  { tag: tags.heading5, fontSize: '1.1em', fontWeight: '600', color: '#c0c0c0' },
  { tag: tags.heading6, fontSize: '1em', fontWeight: '600', color: '#b0b0b0' },

  // Inline Formatting
  { tag: tags.strong, fontWeight: '700', color: '#ffffff' },
  { tag: tags.emphasis, fontStyle: 'italic', color: '#dcddde' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: '#8e8e8e' },
  { tag: tags.quote, fontStyle: 'italic', color: '#999' },
  { tag: tags.link, color: '#9d86e8', textDecoration: 'underline' },
  { tag: tags.url, color: '#555', textDecoration: 'none' },
  { tag: tags.list, color: '#7c3aed' },

  // Inline Code (Monospace)
  {
    tag: tags.monospace,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#e6a5c2',
    backgroundColor: '#2f2f2f',
    borderRadius: '4px',
    padding: '1px 4px',
  },

  // Code Syntax Highlighting (Dracula/Obsidian Dark inspired)
  { tag: tags.keyword, color: '#ff79c6' },
  { tag: tags.operator, color: '#ff79c6' },
  { tag: tags.atom, color: '#bd93f9' },
  { tag: tags.number, color: '#bd93f9' },
  { tag: tags.bool, color: '#bd93f9' },
  { tag: tags.definition(tags.variableName), color: '#f8f8f2' },
  { tag: tags.variableName, color: '#f8f8f2' },
  { tag: tags.string, color: '#f1fa8c' },
  { tag: tags.special(tags.string), color: '#f1fa8c' },
  { tag: tags.comment, color: '#6272a4', fontStyle: 'italic' },
  { tag: tags.typeName, color: '#8be9fd' },
  { tag: tags.className, color: '#8be9fd' },
  { tag: tags.propertyName, color: '#66d9ef' },
  { tag: tags.tagName, color: '#ff79c6' },
  { tag: tags.attributeName, color: '#50fa7b' },
  { tag: tags.meta, color: '#555' },
  { tag: tags.bracket, color: '#f8f8f2' },

  // Default Text
  { tag: tags.content, color: '#dcddde' },
]);

const markdownThemeLight = HighlightStyle.define([
  // Headings
  {
    tag: tags.heading1,
    fontSize: '2.2em',
    fontWeight: '700',
    color: 'rgb(var(--obsidian-strong))',
    lineHeight: '1.2',
    marginTop: '1em',
    marginBottom: '0.5em',
  },
  {
    tag: tags.heading2,
    fontSize: '1.8em',
    fontWeight: '600',
    color: 'rgb(var(--obsidian-strong))',
    marginTop: '1em',
    marginBottom: '0.5em',
  },
  {
    tag: tags.heading3,
    fontSize: '1.5em',
    fontWeight: '600',
    color: 'rgb(var(--obsidian-strong))',
    marginTop: '0.8em',
  },
  {
    tag: tags.heading4,
    fontSize: '1.25em',
    fontWeight: '600',
    color: 'rgb(var(--obsidian-text))',
  },
  { tag: tags.heading5, fontSize: '1.1em', fontWeight: '600', color: 'rgb(var(--obsidian-text))' },
  { tag: tags.heading6, fontSize: '1em', fontWeight: '600', color: 'rgb(var(--obsidian-text))' },

  // Inline Formatting
  { tag: tags.strong, fontWeight: '700', color: 'rgb(var(--obsidian-strong))' },
  { tag: tags.emphasis, fontStyle: 'italic', color: 'rgb(var(--obsidian-text))' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'rgb(var(--obsidian-muted))' },
  { tag: tags.quote, fontStyle: 'italic', color: 'rgb(var(--obsidian-muted))' },
  { tag: tags.link, color: 'rgb(var(--obsidian-accent))', textDecoration: 'underline' },
  { tag: tags.url, color: 'rgb(var(--obsidian-muted))', textDecoration: 'none' },
  { tag: tags.list, color: 'rgb(var(--obsidian-accent))' },

  // Inline Code (Monospace)
  {
    tag: tags.monospace,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'rgb(var(--obsidian-text))',
    backgroundColor: 'rgb(var(--obsidian-active))',
    borderRadius: '4px',
    padding: '1px 4px',
  },

  // Code Syntax Highlighting (keep existing palette)
  { tag: tags.keyword, color: '#ff79c6' },
  { tag: tags.operator, color: '#ff79c6' },
  { tag: tags.atom, color: '#bd93f9' },
  { tag: tags.number, color: '#bd93f9' },
  { tag: tags.bool, color: '#bd93f9' },
  { tag: tags.definition(tags.variableName), color: 'rgb(var(--obsidian-text))' },
  { tag: tags.variableName, color: 'rgb(var(--obsidian-text))' },
  { tag: tags.string, color: '#b08900' },
  { tag: tags.special(tags.string), color: '#b08900' },
  { tag: tags.comment, color: 'rgb(var(--obsidian-muted))', fontStyle: 'italic' },
  { tag: tags.typeName, color: '#0ea5e9' },
  { tag: tags.className, color: '#0ea5e9' },
  { tag: tags.propertyName, color: 'rgb(var(--obsidian-text))' },
  { tag: tags.tagName, color: '#ff79c6' },
  { tag: tags.attributeName, color: '#16a34a' },
  { tag: tags.meta, color: 'rgb(var(--obsidian-muted))' },
  { tag: tags.bracket, color: 'rgb(var(--obsidian-text))' },

  // Default Text
  { tag: tags.content, color: 'rgb(var(--obsidian-text))' },
]);

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
    readonly interactive: boolean
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return (
      other.checked === this.checked &&
      other.pos === this.pos &&
      other.interactive === this.interactive
    );
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement('input');
    wrap.type = 'checkbox';
    wrap.checked = this.checked;
    wrap.className = 'cm-checkbox-widget';

    if (!this.interactive) {
      wrap.disabled = true;
      wrap.style.cursor = 'default';
      return wrap;
    }

    wrap.onclick = (e) => {
      e.preventDefault();
      // The marker is `[ ]` or `[x]`. pos is at the start `[`. We want to replace
      // the character at pos + 1 (the space or x).
      const changePos = this.pos + 1;
      const newChar = this.checked ? ' ' : 'x';
      view.dispatch({
        changes: { from: changePos, to: changePos + 1, insert: newChar },
      });
    };
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly displayMode: boolean,
    readonly cursorPos: number,
    readonly interactive: boolean
  ) {
    super();
  }

  eq(other: MathWidget) {
    return (
      other.tex === this.tex &&
      other.displayMode === this.displayMode &&
      other.cursorPos === this.cursorPos &&
      other.interactive === this.interactive
    );
  }

  toDOM(view: EditorView) {
    const wrap = document.createElement(this.displayMode ? 'div' : 'span');
    wrap.className = this.displayMode
      ? 'cm-math-widget cm-math-block'
      : 'cm-math-widget cm-math-inline';
    wrap.style.cursor = this.interactive ? 'text' : 'default';
    try {
      wrap.innerHTML = katex.renderToString(this.tex, {
        displayMode: this.displayMode,
        throwOnError: false,
        strict: false,
      });
    } catch {
      // If KaTeX fails for any reason, fall back to raw TeX.
      wrap.textContent = this.tex;
    }

    if (this.interactive) {
      wrap.addEventListener('mousedown', (e) => {
        e.preventDefault();
        view.focus();
        view.dispatch({
          selection: { anchor: this.cursorPos },
          scrollIntoView: true,
        });
      });
    }

    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

const isEscapedAt = (text: string, index: number) => {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
};

const rangeOverlapsAny = (
  from: number,
  to: number,
  ranges: Array<{ from: number; to: number }>
) => {
  for (const r of ranges) {
    if (from < r.to && to > r.from) return true;
  }
  return false;
};

const createLivePreviewPlugin = (args: { interactive: boolean; alwaysHideSyntax: boolean }) =>
  // Plugin to hide markdown syntax and render checkboxes
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.compute(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.focusChanged
        ) {
          // Keep this synchronous. Updating decorations asynchronously (e.g. via rAF)
          // can desync CodeMirror's rendering and leave stale widgets/marks.
          this.decorations = this.compute(update.view);
        }
      }

      compute(view: EditorView) {
        const widgets: Range<Decoration>[] = [];
        const selection = view.state.selection;
        const hasFocus = view.hasFocus;

        for (const { from, to } of view.visibleRanges) {
          const codeRanges: Array<{ from: number; to: number }> = [];
          syntaxTree(view.state).iterate({
            from,
            to,
            enter: (node) => {
              // Collect code spans/blocks so we don't try to render math inside them.
              // Node names vary a bit across markdown variants; we use a broad filter.
              if (
                (node.name.includes('Code') || node.name.includes('Fenced')) &&
                node.name !== 'CodeMark' &&
                node.name !== 'CodeInfo'
              ) {
                codeRanges.push({ from: node.from, to: node.to });
              }

              // 1. Syntax Hiding Logic
              // We identify nodes that are markers (like `**` or `#`) and hide them if the cursor isn't nearby.
              if (
                node.name === 'HeaderMark' ||
                node.name === 'EmphasisMark' ||
                node.name === 'CodeMark' ||
                node.name === 'QuoteMark' ||
                node.name === 'LinkMark' ||
                node.name === 'URL' ||
                node.name === 'CodeInfo'
              ) {
                const parent = node.node.parent;
                // Check if cursor overlaps with the PARENT node (e.g., the whole Bold block).
                // This ensures markers stay visible while editing anywhere inside the styled text.
                const targetNode = parent ? parent : node.node;
                const overlaps =
                  !args.alwaysHideSyntax &&
                  hasFocus &&
                  selection.ranges.some((r) => r.from <= targetNode.to && r.to >= targetNode.from);

                if (!overlaps) {
                  widgets.push(
                    Decoration.mark({ class: 'cm-syntax-hidden' }).range(node.from, node.to)
                  );

                  // Some markdown markers are typically followed by a single required space
                  // (e.g. '# ' for headings, '> ' for blockquotes). If we hide only the marker,
                  // the leftover space looks like inconsistent indentation.
                  if (node.name === 'HeaderMark' || node.name === 'QuoteMark') {
                    const after = node.to;
                    if (
                      after < view.state.doc.length &&
                      view.state.sliceDoc(after, after + 1) === ' '
                    ) {
                      widgets.push(
                        Decoration.mark({ class: 'cm-syntax-hidden' }).range(after, after + 1)
                      );
                    }
                  }
                }
              }

              // 2. Checkbox Logic
              if (node.name === 'TaskMarker') {
                const parent = node.node.parent;
                const targetNode = parent ? parent : node.node;
                const overlaps =
                  hasFocus &&
                  selection.ranges.some((r) => r.from <= targetNode.to && r.to >= targetNode.from);

                if (!overlaps) {
                  const text = view.state.sliceDoc(node.from, node.to);
                  const isChecked = text.includes('x') || text.includes('X');

                  widgets.push(
                    Decoration.replace({
                      widget: new CheckboxWidget(isChecked, node.from, args.interactive),
                      inclusive: true,
                    }).range(node.from, node.to)
                  );
                }
              }
            },
          });

          // 3. Math (KaTeX) Logic
          // Render $...$ and $$...$$ when not actively editing inside the expression.
          // This is intentionally conservative: it skips anything inside code spans/blocks.
          const visibleText = view.state.sliceDoc(from, to);

          const overlapsSelection = (aFrom: number, aTo: number) =>
            hasFocus && selection.ranges.some((r) => r.from <= aTo && r.to >= aFrom);

          // First, handle block math $$...$$ (can span newlines)
          let i = 0;
          while (i < visibleText.length - 1) {
            const start = visibleText.indexOf('$$', i);
            if (start === -1) break;
            if (isEscapedAt(visibleText, start)) {
              i = start + 2;
              continue;
            }
            // Avoid treating $$$ as $$ delimiter.
            if (visibleText[start + 2] === '$') {
              i = start + 1;
              continue;
            }

            let end = start + 2;
            while (true) {
              end = visibleText.indexOf('$$', end);
              if (end === -1) break;
              if (!isEscapedAt(visibleText, end)) break;
              end += 2;
            }
            if (end === -1) break;

            const absFrom = from + start;
            const absTo = from + end + 2;
            const inner = visibleText.slice(start + 2, end).trim();

            if (
              inner.length > 0 &&
              !rangeOverlapsAny(absFrom, absTo, codeRanges) &&
              !overlapsSelection(absFrom, absTo)
            ) {
              widgets.push(
                Decoration.replace({
                  widget: new MathWidget(inner, true, absFrom + 2, args.interactive),
                  inclusive: true,
                }).range(absFrom, absTo)
              );
            }

            i = end + 2;
          }

          // Then, handle inline math $...$ (single-line; does not match $$...$$)
          i = 0;
          while (i < visibleText.length) {
            const start = visibleText.indexOf('$', i);
            if (start === -1) break;
            if (visibleText[start + 1] === '$' || isEscapedAt(visibleText, start)) {
              i = start + 1;
              continue;
            }

            let end = start + 1;
            while (true) {
              end = visibleText.indexOf('$', end);
              if (end === -1) break;
              if (visibleText[end - 1] === '$') {
                end += 1;
                continue;
              }
              if (!isEscapedAt(visibleText, end)) break;
              end += 1;
            }
            if (end === -1) break;

            const inner = visibleText.slice(start + 1, end);
            // Conservative inline rules: no newlines, not empty, not whitespace-padded.
            if (
              inner.length > 0 &&
              !inner.includes('\n') &&
              inner.trim() === inner &&
              !inner.startsWith(' ') &&
              !inner.endsWith(' ')
            ) {
              const absFrom = from + start;
              const absTo = from + end + 1;
              if (
                !rangeOverlapsAny(absFrom, absTo, codeRanges) &&
                !overlapsSelection(absFrom, absTo)
              ) {
                widgets.push(
                  Decoration.replace({
                    widget: new MathWidget(inner, false, absFrom + 1, args.interactive),
                    inclusive: true,
                  }).range(absFrom, absTo)
                );
              }
            }

            i = end + 1;
          }
        }
        return Decoration.set(widgets);
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );

export const createMarkdownExtensions = (args: {
  appTheme: AppTheme;
  variant: MarkdownViewVariant;
  editable?: boolean;
}): any[] => {
  const isDark = args.appTheme === 'dark';
  const editable = args.editable ?? true;

  const interactive = editable;
  // In read-only mode, always hide markdown syntax markers.
  // In editable mode, hide markers only when the cursor isn't nearby.
  const alwaysHideSyntax = !editable;

  const extensions: any[] = [];

  if (editable) {
    // In live preview we hide markdown heading markers. When moving up into a heading,
    // the cursor tends to land after the `#` prefix (visual start of text).
    // This keybinding snaps ArrowUp to the true line start for headings so users
    // can land before the `#` if they want to edit heading level/markers.
    extensions.push(
      Prec.highest(
        keymap.of([
          {
            key: 'ArrowUp',
            run: (view: any) => {
              const moved = cursorLineUp(view);
              if (!moved) return false;

              const head = view.state.selection.main.head;
              const line = view.state.doc.lineAt(head);
              const m = /^#{1,6}\s+/.exec(line.text);
              if (!m) return true;

              const prefixEnd = line.from + m[0].length;
              if (head > line.from && head <= prefixEnd) {
                view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
              }
              return true;
            },
          },
        ])
      )
    );
  }

  extensions.push(markdown({ base: markdownLanguage, codeLanguages: languages }));
  extensions.push(syntaxHighlighting(isDark ? markdownThemeDark : markdownThemeLight));
  extensions.push(EditorView.lineWrapping);

  if (editable) {
    // CodeMirror defaults to Mod+Click = add cursor/selection range.
    // This conflicts with Cmd+Click-to-open-link, so disable it.
    extensions.push(EditorView.clickAddsSelectionRange.of(() => false));
  }

  extensions.push(openLinkOnModClickPlugin);

  extensions.push(
    EditorView.theme(
      {
        '&': { color: 'rgb(var(--obsidian-text))', backgroundColor: 'transparent' },
        '.cm-content': { caretColor: 'rgb(var(--obsidian-accent))' },
        '&.cm-focused .cm-cursor': { borderLeftColor: 'rgb(var(--obsidian-accent))' },
        '&.cm-focused .cm-selectionBackground, ::selection': {
          backgroundColor: 'rgb(var(--obsidian-accent) / 0.25)',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          color: 'rgb(var(--obsidian-muted))',
          border: 'none',
        },
        '.cm-math-block': { margin: '0.75em 0' },
      },
      { dark: isDark }
    )
  );

  if (args.variant === 'embedded') {
    extensions.push(
      EditorView.theme(
        {
          '.cm-scroller': { paddingTop: '12px', paddingBottom: '24px' },
          '.cm-content': { maxWidth: 'none', margin: '0', padding: '0 16px' },
        },
        { dark: isDark }
      )
    );
  }

  if (args.variant === 'chat') {
    extensions.push(
      EditorView.theme(
        {
          '.cm-scroller': { paddingTop: '0px', paddingBottom: '0px' },
          '.cm-content': { maxWidth: 'none', margin: '0', padding: '0' },

          // Normalize spacing so chat message blocks are consistent regardless
          // of top/bottom margins on the first/last markdown element.
          '.cm-content > *:first-child': { marginTop: '0 !important' },
          '.cm-content > *:last-child': { marginBottom: '0 !important' },

          // Consistent paragraph/list/blockquote/code spacing inside chat cards
          '.cm-content p, .cm-content li, .cm-content blockquote, .cm-content pre': {
            marginTop: '0',
            marginBottom: '0.5em',
          },
          '.cm-content li': { marginTop: '0', marginBottom: '0.25em' },
          '.cm-content ul, .cm-content ol': {
            paddingLeft: '1.2em',
            marginTop: '0',
            marginBottom: '0.5em',
          },
          '.cm-content blockquote': {
            borderLeft: '2px solid rgb(var(--obsidian-accent))',
            paddingLeft: '10px',
            marginTop: '0',
            marginBottom: '0.5em',
            color: 'rgb(var(--obsidian-muted))',
            fontStyle: 'italic',
          },
          '.cm-content pre': {
            background: 'rgb(var(--obsidian-active))',
            padding: '8px',
            borderRadius: '6px',
            overflowX: 'auto',
            marginTop: '0',
            marginBottom: '0.5em',
          },
          '.cm-content code': {
            background: 'rgb(var(--obsidian-active))',
            padding: '0 4px',
            borderRadius: '4px',
          },
        },
        { dark: isDark }
      )
    );
  }

  // Make chat previews feel like static note cards.
  if (args.variant === 'chat' && !editable) {
    extensions.push(
      EditorView.theme(
        {
          '&.cm-focused': { outline: 'none' },
          '.cm-gutters': { display: 'none' },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
          '.cm-cursor, .cm-dropCursor': { display: 'none !important' },
          '.cm-selectionBackground': { backgroundColor: 'transparent !important' },
        },
        { dark: isDark }
      )
    );
  }

  if (!editable) {
    extensions.push(EditorView.editable.of(false));
  }

  extensions.push(createLivePreviewPlugin({ interactive, alwaysHideSyntax }));

  return extensions;
};
