'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { Check, Copy, SendHorizontal } from 'lucide-react';
import { ChatMessage, sendChatMessage } from '@/features/ai/services/geminiChatService';
import { createMarkdownExtensions, useAppTheme } from '@/features/editor/lib/markdownExtensions';
import type { Frame, Note, WhiteboardItem } from '@/shared/types';
import {
  buildFrameMentionToken,
  buildNoteMentionToken,
  collectContextNotesForChat,
  resolveMentionedFrames,
  resolveMentionedNotes,
  sanitizeChatTextForModel,
} from '@/features/ai/lib/noteMentions';

type ChatPanelProps = {
  className?: string;
  isOpen: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  notes: Note[];
  frames: Frame[];
  items: WhiteboardItem[];
};

type ChatPersonality = {
  id: string;
  label: string;
  systemInstruction: string;
};

type ChatHistoryEntry = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  personalityId: string;
  messages: ChatMessage[];
};

const MAX_LOCAL_MESSAGES = 60;
const MAX_SEND_MESSAGES = 30;
const MAX_CHAT_HISTORY = 24;
const CHAT_HISTORY_STORAGE_KEY = 'whiteboard-note.aiChat.history.v1';
const LEGACY_CHAT_STORAGE_KEY = 'whiteboard-note.aiChat.messages.v1';

const BASE_SYSTEM_INSTRUCTION =
  'You are a helpful assistant inside a markdown whiteboard note-taking app. Respond in Markdown (no HTML).';
const MENTION_INSTRUCTION =
  'Mentions: You may see @note:<title> and @frame:<name>. @frame refers to a frame/group on the whiteboard; the notes inside mentioned frames are provided as hidden context notes. When the user asks to summarize a mentioned frame, summarize the provided context notes directly (do not ask the user to pick from a list).';

const buildSystemInstruction = (tone: string) =>
  `${BASE_SYSTEM_INSTRUCTION} ${tone}\n\n${MENTION_INSTRUCTION}`;

const CHAT_PERSONALITIES: ChatPersonality[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    systemInstruction: buildSystemInstruction(
      'Be concise and ask clarifying questions when needed.'
    ),
  },
  {
    id: 'planner',
    label: 'Planner',
    systemInstruction: buildSystemInstruction(
      'Provide structured steps and checklists. Call out dependencies and tradeoffs. Keep it short.'
    ),
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    systemInstruction: buildSystemInstruction(
      'Generate 3-5 creative options or angles with quick pros/cons. Keep it brief.'
    ),
  },
  {
    id: 'editor',
    label: 'Editor',
    systemInstruction: buildSystemInstruction(
      'Improve clarity and tone with tight rewrites. Explain changes in 2-3 bullets if needed.'
    ),
  },
];

const DEFAULT_PERSONALITY_ID = CHAT_PERSONALITIES[0]?.id ?? 'balanced';

const getPersonality = (id: string) =>
  CHAT_PERSONALITIES.find((personality) => personality.id === id) ?? CHAT_PERSONALITIES[0]!;

const createChatId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `chat_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
};

const normalizeMessages = (raw: unknown): ChatMessage[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m): ChatMessage => ({
      role: (m as any)?.role === 'model' ? 'model' : 'user',
      text: typeof (m as any)?.text === 'string' ? ((m as any).text as string) : '',
    }))
    .filter((m) => m.text.trim().length > 0)
    .slice(-MAX_LOCAL_MESSAGES);
};

const buildChatTitle = (messages: ChatMessage[]) => {
  const firstUser = messages.find((m) => m.role === 'user' && m.text.trim().length > 0);
  if (!firstUser) return 'Untitled chat';
  const clean = firstUser.text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Untitled chat';
  return clean.length > 48 ? `${clean.slice(0, 48)}...` : clean;
};

const sortChatHistory = (history: ChatHistoryEntry[]) =>
  [...history]
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
    .slice(0, MAX_CHAT_HISTORY);

const parseChatHistory = (raw: string | null): ChatHistoryEntry[] => {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => {
      const messages = normalizeMessages((entry as any)?.messages);
      if (messages.length === 0) return null;
      const id = typeof (entry as any)?.id === 'string' ? (entry as any).id : createChatId();
      const personalityId =
        typeof (entry as any)?.personalityId === 'string'
          ? (entry as any).personalityId
          : DEFAULT_PERSONALITY_ID;
      const createdAt =
        typeof (entry as any)?.createdAt === 'number' ? (entry as any).createdAt : Date.now();
      const updatedAt =
        typeof (entry as any)?.updatedAt === 'number' ? (entry as any).updatedAt : createdAt;
      const title =
        typeof (entry as any)?.title === 'string' && (entry as any).title.trim().length > 0
          ? (entry as any).title
          : buildChatTitle(messages);
      return {
        id,
        title,
        createdAt,
        updatedAt,
        personalityId,
        messages,
      } satisfies ChatHistoryEntry;
    })
    .filter((entry): entry is ChatHistoryEntry => Boolean(entry));
};

const formatChatTimestamp = (value: number) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '';
  }
};

const copyToClipboard = async (text: string) => {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', 'true');
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  el.style.top = '0';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
};

export const ChatPanel: React.FC<ChatPanelProps> = ({
  className,
  isOpen,
  width,
  onWidthChange,
  notes,
  frames,
  items,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatHistoryEntry[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [selectedPersonalityId, setSelectedPersonalityId] = useState(DEFAULT_PERSONALITY_ID);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchorIndex, setMentionAnchorIndex] = useState<number | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const appTheme = useAppTheme();
  const markdownPreviewExtensions = useMemo(
    () => createMarkdownExtensions({ appTheme, variant: 'chat', editable: false }),
    [appTheme]
  );
  const markdownEditExtensions = useMemo(
    () => createMarkdownExtensions({ appTheme, variant: 'chat', editable: true }),
    [appTheme]
  );

  const editorBasicSetup = useMemo(
    () => ({
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
    }),
    []
  );

  const listRef = useRef<HTMLDivElement>(null);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);

  const canSend = useMemo(() => draft.trim().length > 0 && !isSending, [draft, isSending]);
  const activePersonality = useMemo(
    () => getPersonality(selectedPersonalityId),
    [selectedPersonalityId]
  );
  const draftMentionedNotes = useMemo(() => resolveMentionedNotes(draft, notes), [draft, notes]);

  const draftMentionedFrames = useMemo(
    () => resolveMentionedFrames(draft, frames),
    [draft, frames]
  );

  const draftAutoIncludedNotes = useMemo(() => {
    if (!draftMentionedFrames.length) return [];
    return collectContextNotesForChat({
      messages: [{ text: draft }],
      notes,
      items,
      frames,
      // UI display can be larger than request clamp; keep it bounded.
      maxNotes: 24,
    });
  }, [draft, draftMentionedFrames.length, notes, items, frames]);

  type MentionOption =
    | { kind: 'frame'; id: string; label: string; frame: Frame }
    | { kind: 'note'; id: string; label: string; note: Note };

  const mentionMatches = useMemo(() => {
    if (!mentionOpen) return [] as MentionOption[];
    const q = mentionQuery.trim().toLowerCase();

    const frameMatches = (
      q ? frames.filter((f) => (f.name ?? '').toLowerCase().includes(q)) : frames
    )
      .slice(0, 6)
      .map(
        (frame) =>
          ({
            kind: 'frame',
            id: frame.id,
            label: (frame.name ?? '').trim() || 'Untitled Frame',
            frame,
          }) as MentionOption
      );

    const remaining = Math.max(0, 8 - frameMatches.length);
    const noteMatches = (q ? notes.filter((n) => (n.title ?? '').toLowerCase().includes(q)) : notes)
      .slice(0, remaining)
      .map(
        (note) =>
          ({
            kind: 'note',
            id: note.id,
            label: (note.title ?? '').trim() || 'Untitled Note',
            note,
          }) as MentionOption
      );

    return [...frameMatches, ...noteMatches];
  }, [mentionOpen, mentionQuery, notes, frames]);

  useEffect(() => {
    try {
      const restored = parseChatHistory(window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY));
      if (restored.length > 0) {
        setChatHistory(sortChatHistory(restored));
        return;
      }

      const legacyRaw = window.localStorage.getItem(LEGACY_CHAT_STORAGE_KEY);
      if (!legacyRaw) return;
      const legacyParsed = JSON.parse(legacyRaw) as unknown;
      const legacyMessages = normalizeMessages(legacyParsed);
      if (legacyMessages.length === 0) return;
      const now = Date.now();
      const migrated: ChatHistoryEntry = {
        id: createChatId(),
        title: buildChatTitle(legacyMessages),
        createdAt: now,
        updatedAt: now,
        personalityId: DEFAULT_PERSONALITY_ID,
        messages: legacyMessages,
      };
      setChatHistory(sortChatHistory([migrated]));
      window.localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      if (chatHistory.length === 0) {
        window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(chatHistory));
    } catch {
      // ignore
    }
  }, [chatHistory]);

  const updateMentionStateFromCaret = () => {
    const el = draftInputRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? 0;
    const text = el.value ?? '';

    // Find the last '@' before the caret.
    const at = text.lastIndexOf('@', Math.max(0, caret - 1));
    if (at < 0) {
      setMentionOpen(false);
      setMentionQuery('');
      setMentionAnchorIndex(null);
      return;
    }

    // Require start-of-string or whitespace before '@' to avoid matching emails.
    if (at > 0) {
      const prev = text[at - 1];
      if (prev && !/\s/.test(prev)) {
        setMentionOpen(false);
        setMentionQuery('');
        setMentionAnchorIndex(null);
        return;
      }
    }

    // Only consider the substring from '@' to caret.
    const segment = text.slice(at + 1, caret);
    if (segment.length > 60) {
      setMentionOpen(false);
      setMentionQuery('');
      setMentionAnchorIndex(null);
      return;
    }
    // Stop if user already typed whitespace.
    if (/\s/.test(segment)) {
      setMentionOpen(false);
      setMentionQuery('');
      setMentionAnchorIndex(null);
      return;
    }

    setMentionOpen(true);
    setMentionQuery(segment);
    setMentionAnchorIndex(at);
    setMentionActiveIndex(0);
  };

  const insertMention = (opt: MentionOption) => {
    const el = draftInputRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? 0;
    const at = mentionAnchorIndex;
    if (at == null || at < 0 || at > caret) return;

    const token =
      (opt.kind === 'note' ? buildNoteMentionToken(opt.note) : buildFrameMentionToken(opt.frame)) +
      ' ';
    const next = draft.slice(0, at) + token + draft.slice(caret);
    setDraft(next);
    setMentionOpen(false);
    setMentionQuery('');
    setMentionAnchorIndex(null);

    window.setTimeout(() => {
      const node = draftInputRef.current;
      if (!node) return;
      const pos = at + token.length;
      node.focus();
      node.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only handle primary button/primary contact.
    if (e.button !== 0) return;
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = width;
    const minWidth = 580;
    const maxWidth = 820;

    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      onWidthChange(next);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const scrollToBottomSoon = () => {
    const root = listRef.current;
    if (!root) return;
    // Defer until after DOM updates.
    window.setTimeout(() => {
      root.scrollTop = root.scrollHeight;
    }, 0);
  };

  const saveChatHistory = (
    chatId: string,
    nextMessages: ChatMessage[],
    options?: { updatedAt?: number; createdAt?: number; personalityId?: string }
  ) => {
    const clampedMessages = nextMessages.slice(-MAX_LOCAL_MESSAGES);
    const now = options?.updatedAt ?? Date.now();
    const personalityId = options?.personalityId ?? selectedPersonalityId;
    setChatHistory((prev) => {
      const existing = prev.find((chat) => chat.id === chatId);
      const createdAt = existing?.createdAt ?? options?.createdAt ?? now;
      const entry: ChatHistoryEntry = {
        id: chatId,
        title: buildChatTitle(clampedMessages),
        createdAt,
        updatedAt: now,
        personalityId,
        messages: clampedMessages,
      };
      return sortChatHistory([...prev.filter((chat) => chat.id !== chatId), entry]);
    });
  };

  const selectChatHistory = (chatId: string) => {
    const chat = chatHistory.find((entry) => entry.id === chatId);
    if (!chat) return;
    setActiveChatId(chatId);
    setMessages(chat.messages);
    setSelectedPersonalityId(
      CHAT_PERSONALITIES.some((personality) => personality.id === chat.personalityId)
        ? chat.personalityId
        : DEFAULT_PERSONALITY_ID
    );
    setError(null);
    setEditingIndex(null);
    setCopiedIndex(null);
    scrollToBottomSoon();
  };

  const closeActiveChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setEditingIndex(null);
    setCopiedIndex(null);
    setError(null);
  };

  const clearChat = () => {
    setError(null);
    setEditingIndex(null);
    setCopiedIndex(null);
    setMentionOpen(false);
    setMentionQuery('');
    setMentionAnchorIndex(null);
    setMentionActiveIndex(0);
    setDraft('');
    if (activeChatId) {
      setChatHistory((prev) => prev.filter((chat) => chat.id !== activeChatId));
      setActiveChatId(null);
      setMessages([]);
      return;
    }
    setChatHistory([]);
    setMessages([]);
    try {
      window.localStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handlePersonalityChange = (nextId: string) => {
    setSelectedPersonalityId(nextId);
    if (!activeChatId) return;
    setChatHistory((prev) => {
      const existing = prev.find((chat) => chat.id === activeChatId);
      if (!existing || existing.personalityId === nextId) return prev;
      const updated: ChatHistoryEntry = {
        ...existing,
        personalityId: nextId,
        updatedAt: Date.now(),
      };
      return sortChatHistory([...prev.filter((chat) => chat.id !== activeChatId), updated]);
    });
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || isSending) return;

    setMentionOpen(false);
    setMentionQuery('');
    setMentionAnchorIndex(null);
    setMentionActiveIndex(0);
    setDraft('');
    setError(null);

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text } as ChatMessage].slice(
      -MAX_LOCAL_MESSAGES
    );
    const now = Date.now();
    let chatId = activeChatId;
    if (!chatId) {
      chatId = createChatId();
      setActiveChatId(chatId);
      saveChatHistory(chatId, nextMessages, {
        createdAt: now,
        updatedAt: now,
        personalityId: selectedPersonalityId,
      });
    } else {
      saveChatHistory(chatId, nextMessages, {
        updatedAt: now,
        personalityId: selectedPersonalityId,
      });
    }
    setMessages(nextMessages);
    scrollToBottomSoon();

    setIsSending(true);
    try {
      const requestMessagesRaw = nextMessages.slice(-MAX_SEND_MESSAGES);
      const userMessagesRaw = requestMessagesRaw.filter((m) => m.role === 'user');
      const noteContext = collectContextNotesForChat({
        messages: userMessagesRaw,
        notes,
        items,
        frames,
        maxNotes: 8,
      });

      // Prevent the model from seeing internal IDs like `(frame:uuid)`.
      const requestMessages = requestMessagesRaw.map((m) => ({
        ...m,
        text: sanitizeChatTextForModel(m.text),
      }));
      const responseText = await sendChatMessage({
        messages: requestMessages,
        systemInstruction: activePersonality.systemInstruction,
        noteContext,
      });

      const withModel: ChatMessage[] = [
        ...nextMessages,
        { role: 'model', text: responseText } as ChatMessage,
      ].slice(-MAX_LOCAL_MESSAGES);
      setMessages(withModel);
      if (chatId) {
        saveChatHistory(chatId, withModel, {
          updatedAt: Date.now(),
          personalityId: selectedPersonalityId,
        });
      }
      scrollToBottomSoon();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'AI chat failed';
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  const copyMessage = async (idx: number) => {
    const m = messages[idx];
    if (!m) return;
    try {
      await copyToClipboard(m.text);
      setCopiedIndex(idx);
      window.setTimeout(() => {
        setCopiedIndex((current) => (current === idx ? null : current));
      }, 1400);
    } catch {
      setError('Copy failed');
    }
  };

  return (
    <aside
      className={
        `${isOpen ? 'hidden md:flex' : 'hidden md:hidden'} shrink-0 border-l border-obsidian-border bg-obsidian-sidebar flex-col relative ` +
        (className || '')
      }
      style={{ width }}
      aria-label="AI chat panel"
    >
      <div
        onPointerDown={handleResizePointerDown}
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize"
        title="Resize chat panel"
        aria-hidden="true"
      >
        <div className="absolute left-0 top-0 bottom-0 w-px bg-obsidian-border" />
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-transparent hover:bg-obsidian-border/30" />
      </div>

      <div className="p-4 border-b border-obsidian-border flex items-center justify-between gap-2">
        <select
          value={selectedPersonalityId}
          onChange={(e) => handlePersonalityChange(e.target.value)}
          className="text-xs uppercase tracking-wider bg-obsidian-bg text-obsidian-text border border-obsidian-border rounded px-2 py-1 focus:outline-none focus:border-obsidian-accent"
          aria-label="Select AI personality"
        >
          {CHAT_PERSONALITIES.map((personality) => (
            <option key={personality.id} value={personality.id}>
              {personality.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          {activeChatId && (
            <button
              onClick={closeActiveChat}
              className="text-xs text-obsidian-muted hover:text-obsidian-text"
              title="View chat history"
            >
              History
            </button>
          )}
          <button
            onClick={clearChat}
            className="text-xs text-obsidian-muted hover:text-obsidian-text"
            title="Clear chat"
          >
            Clear
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {!activeChatId ? (
          chatHistory.length === 0 ? (
            <div className="text-sm text-obsidian-muted">
              No chats yet. Send a message to start a new chat.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-obsidian-muted">
                Chat history
              </div>
              <div className="space-y-2">
                {chatHistory.map((chat) => {
                  const personality = getPersonality(chat.personalityId);
                  return (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => selectChatHistory(chat.id)}
                      className="w-full text-left rounded border border-obsidian-border bg-obsidian-bg/40 px-3 py-2 hover:bg-obsidian-active"
                      title="Open chat"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-obsidian-text font-medium truncate">
                          {chat.title}
                        </div>
                        <div className="text-xs text-obsidian-muted">
                          {formatChatTimestamp(chat.updatedAt)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-obsidian-muted">
                        {chat.messages.length} messages | {personality.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )
        ) : messages.length === 0 ? (
          <div className="text-sm text-obsidian-muted">
            Ask anything. I'll keep replies concise.
          </div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={idx}
              className={
                `rounded-md border border-obsidian-border shadow-sm ` +
                `px-3 py-2 ` +
                (m.role === 'user' ? 'bg-obsidian-sidebar' : 'bg-obsidian-bg')
              }
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-[11px] uppercase tracking-wider text-obsidian-muted">
                  {m.role === 'user' ? 'You' : 'Gemini'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setCopiedIndex(null);
                      setEditingIndex((cur) => (cur === idx ? null : idx));
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-obsidian-border bg-obsidian-bg text-xs text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-active"
                    title={editingIndex === idx ? 'Done editing' : 'Edit message'}
                    aria-label={editingIndex === idx ? 'Done editing' : 'Edit message'}
                  >
                    <span>{editingIndex === idx ? 'Done' : 'Edit'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void copyMessage(idx);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-obsidian-border bg-obsidian-bg text-xs text-obsidian-muted hover:text-obsidian-text hover:bg-obsidian-active"
                    title={copiedIndex === idx ? 'Copied' : 'Copy message'}
                    aria-label={copiedIndex === idx ? 'Copied' : 'Copy message'}
                  >
                    {copiedIndex === idx ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copiedIndex === idx ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {(() => {
                const mentionedNotes = resolveMentionedNotes(m.text, notes);
                const mentionedFrames = resolveMentionedFrames(m.text, frames);
                if (mentionedNotes.length === 0 && mentionedFrames.length === 0) return null;

                const autoIncludedNotes =
                  mentionedFrames.length > 0
                    ? collectContextNotesForChat({
                        messages: [{ text: m.text }],
                        notes,
                        items,
                        frames,
                        maxNotes: 24,
                      })
                    : [];

                return (
                  <div className="mb-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="text-xs text-obsidian-muted">Context:</div>
                      {mentionedFrames.map((f) => (
                        <div
                          key={f.id}
                          className="text-xs px-2 py-1 rounded border border-obsidian-border bg-obsidian-bg text-obsidian-muted"
                          title="This frame's notes were included as hidden context for the AI"
                        >
                          {f.name}
                        </div>
                      ))}
                      {mentionedNotes.map((n) => (
                        <div
                          key={n.id}
                          className="text-xs px-2 py-1 rounded border border-obsidian-border bg-obsidian-bg text-obsidian-muted"
                          title="This note was included as hidden context for the AI"
                        >
                          {(n.title ?? '').trim() || 'Untitled Note'}
                        </div>
                      ))}
                    </div>

                    {mentionedFrames.length > 0 && autoIncludedNotes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 items-center">
                        <div className="text-xs text-obsidian-muted">Notes:</div>
                        {autoIncludedNotes.map((n) => (
                          <div
                            key={n.id}
                            className="text-xs px-2 py-1 rounded border border-obsidian-border bg-obsidian-bg text-obsidian-muted"
                            title="Included via frame context"
                          >
                            {(n.title ?? '').trim() || 'Untitled Note'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="rounded border border-obsidian-border bg-obsidian-bg/40 px-2 py-2 max-h-96 overflow-auto">
                {editingIndex === idx ? (
                  <CodeMirror
                    value={m.text}
                    height="100%"
                    theme={undefined}
                    extensions={markdownEditExtensions}
                    editable={true}
                    basicSetup={editorBasicSetup}
                    onChange={(value) => {
                      setMessages((prev) => {
                        const next = prev.map((msg, i) =>
                          i === idx ? { ...msg, text: value } : msg
                        );
                        if (activeChatId) {
                          saveChatHistory(activeChatId, next, {
                            updatedAt: Date.now(),
                            personalityId: selectedPersonalityId,
                          });
                        }
                        return next;
                      });
                    }}
                  />
                ) : (
                  <CodeMirror
                    value={m.text}
                    height="100%"
                    theme={undefined}
                    extensions={markdownPreviewExtensions}
                    editable={false}
                    basicSetup={false}
                    onChange={() => {
                      // read-only
                    }}
                  />
                )}
              </div>
            </div>
          ))
        )}

        {error && (
          <div className="text-sm text-red-400 border border-obsidian-border bg-obsidian-bg rounded p-3">
            {error}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-obsidian-border">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 relative"
        >
          <textarea
            ref={draftInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyUp={() => updateMentionStateFromCaret()}
            onClick={() => updateMentionStateFromCaret()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                // Ensure we don't leave the mention picker open on send.
                setMentionOpen(false);
                setMentionQuery('');
                setMentionAnchorIndex(null);
                void send();
                return;
              }

              if (!mentionOpen) return;
              if (e.key === 'Escape') {
                e.preventDefault();
                setMentionOpen(false);
                setMentionQuery('');
                setMentionAnchorIndex(null);
                return;
              }
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionActiveIndex((i) => {
                  const max = Math.max(0, mentionMatches.length - 1);
                  return Math.min(max, i + 1);
                });
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionActiveIndex((i) => Math.max(0, i - 1));
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                // Keep Enter available for sending; only intercept if we have matches.
                if (mentionMatches.length > 0) {
                  e.preventDefault();
                  const selected =
                    mentionMatches[Math.min(mentionActiveIndex, mentionMatches.length - 1)];
                  if (selected) insertMention(selected);
                }
                return;
              }
              if (e.key === 'Tab') {
                if (mentionMatches.length > 0) {
                  e.preventDefault();
                  const selected =
                    mentionMatches[Math.min(mentionActiveIndex, mentionMatches.length - 1)];
                  if (selected) insertMention(selected);
                }
              }
            }}
            rows={2}
            placeholder="Message Gemini…"
            className="flex-1 resize-none bg-obsidian-bg text-sm text-obsidian-text placeholder-obsidian-muted px-3 py-2 rounded border border-obsidian-border focus:border-obsidian-accent focus:outline-none"
            disabled={isSending}
          />

          {mentionOpen && mentionAnchorIndex != null && (
            <div className="absolute left-0 right-[44px] bottom-[52px] rounded border border-obsidian-border bg-obsidian-sidebar shadow-sm overflow-hidden">
              <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-obsidian-muted border-b border-obsidian-border">
                Mention
              </div>
              {mentionMatches.length === 0 ? (
                <div className="px-3 py-2 text-sm text-obsidian-muted">No matches</div>
              ) : (
                <div className="max-h-56 overflow-y-auto">
                  {mentionMatches.map((opt, idx) => (
                    <button
                      key={`${opt.kind}:${opt.id}`}
                      type="button"
                      onMouseDown={(ev) => {
                        // Prevent textarea blur.
                        ev.preventDefault();
                      }}
                      onClick={() => insertMention(opt)}
                      className={
                        'w-full text-left px-3 py-2 text-sm border-b border-obsidian-border last:border-b-0 ' +
                        (idx === mentionActiveIndex
                          ? 'bg-obsidian-active text-obsidian-text'
                          : 'bg-obsidian-sidebar text-obsidian-text hover:bg-obsidian-active')
                      }
                      title={opt.label}
                    >
                      <div className="truncate">
                        <span className="text-obsidian-muted mr-2">
                          {opt.kind === 'frame' ? 'Frame' : 'Note'}
                        </span>
                        {opt.label}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSend}
            className={
              'shrink-0 px-3 py-2 rounded border border-obsidian-border bg-obsidian-bg text-obsidian-text hover:bg-obsidian-active ' +
              (!canSend ? 'opacity-50 cursor-not-allowed' : '')
            }
            title="Send"
            aria-label="Send message"
          >
            <SendHorizontal size={16} />
          </button>
        </form>

        {(draftMentionedNotes.length > 0 || draftMentionedFrames.length > 0) && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="text-xs text-obsidian-muted">Context:</div>
              {draftMentionedFrames.map((f) => (
                <div
                  key={f.id}
                  className="text-xs px-2 py-1 rounded border border-obsidian-border bg-obsidian-bg text-obsidian-muted"
                  title="This frame's notes will be included as hidden context for the AI"
                >
                  {f.name}
                </div>
              ))}
              {draftMentionedNotes.map((n) => (
                <div
                  key={n.id}
                  className="text-xs px-2 py-1 rounded border border-obsidian-border bg-obsidian-bg text-obsidian-muted"
                  title="This note will be included as hidden context for the AI"
                >
                  {(n.title ?? '').trim() || 'Untitled Note'}
                </div>
              ))}
            </div>

            {draftMentionedFrames.length > 0 && draftAutoIncludedNotes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 items-center">
                <div className="text-xs text-obsidian-muted">Notes:</div>
                {draftAutoIncludedNotes.map((n) => (
                  <div
                    key={n.id}
                    className="text-xs px-2 py-1 rounded border border-obsidian-border bg-obsidian-bg text-obsidian-muted"
                    title="Included via frame context"
                  >
                    {(n.title ?? '').trim() || 'Untitled Note'}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isSending && <div className="mt-2 text-xs text-obsidian-muted">Thinking…</div>}
      </div>
    </aside>
  );
};
