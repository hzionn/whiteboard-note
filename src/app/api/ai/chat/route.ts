import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatRole = 'user' | 'model';

type ChatMessage = {
  role: ChatRole;
  text: string;
};

type AiChatRequest = {
  messages: ChatMessage[];
  systemInstruction?: string;
  noteContext?: Array<{ id?: string; title?: string; content?: string }>;
};

const clampString = (value: unknown, maxLen: number): string => {
  if (typeof value !== 'string') return '';
  return value.length > maxLen ? value.slice(0, maxLen) : value;
};

const isChatRole = (value: unknown): value is ChatRole => value === 'user' || value === 'model';

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const body = (await request.json()) as Partial<AiChatRequest>;

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: ChatMessage[] = rawMessages
      .map((m) => ({
        role: isChatRole((m as any)?.role) ? ((m as any).role as ChatRole) : 'user',
        text: typeof (m as any)?.text === 'string' ? ((m as any).text as string) : '',
      }))
      .filter((m) => m.text.trim().length > 0);

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: missing messages', requestId },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server not configured: missing GEMINI_API_KEY', requestId },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // Keep model choice consistent with the existing AI writing actions.
    const modelName = 'gemini-3-flash-preview';

    const baseSystemInstruction =
      (typeof body.systemInstruction === 'string' ? body.systemInstruction : '').trim() ||
      'You are a helpful assistant inside a markdown whiteboard note-taking app. Be concise and ask clarifying questions when needed.';

    const rawNoteContext = Array.isArray(body.noteContext) ? body.noteContext : [];
    const contextNotes = rawNoteContext
      .map((n) => ({
        id: clampString((n as any)?.id, 256).trim(),
        title: clampString((n as any)?.title, 200).trim(),
        content: typeof (n as any)?.content === 'string' ? ((n as any).content as string) : '',
      }))
      .filter((n) => n.id && n.content.trim().length > 0);

    let contextBlock = '';
    if (contextNotes.length > 0) {
      const parts: string[] = [];
      parts.push(
        '\n\nYou have access to the following context notes. Use them when the user references @note:<title> or @frame:<name>. @frame mentions refer to groups; the relevant notes are included below. Do not claim you lack access to them and do not ask the user to pick from a list if the request is to summarize a mentioned frame.'
      );
      parts.push('\nContext notes (read-only):');
      for (const note of contextNotes) {
        const header = `\n---\n[Note: ${note.title || 'Untitled Note'} | id=${note.id}]\n`;
        const bodyText = note.content;
        const chunk = header + bodyText;
        parts.push(chunk);
      }
      parts.push('\n---\n');
      contextBlock = parts.join('');
    }

    const systemInstruction = `${baseSystemInstruction}${contextBlock}`.trim();

    const contents = messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
      },
    });

    return NextResponse.json({
      requestId,
      text: response.text || '',
    });
  } catch (error) {
    // Avoid logging user content. Keep it minimal.
    console.error('AI chat failed', { requestId, error });
    return NextResponse.json(
      { error: 'Failed to generate AI response', requestId },
      { status: 500 }
    );
  }
}
