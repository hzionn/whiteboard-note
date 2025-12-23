import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AiActionType = 'continue' | 'summarize' | 'improve';

type AiActionRequest = {
  type: AiActionType;
  prompt?: string;
  context?: string;
};

const MAX_INPUT_CHARS = 120_000;

const isAiActionType = (value: unknown): value is AiActionType =>
  value === 'continue' || value === 'summarize' || value === 'improve';

const clampString = (value: unknown, maxLen: number): string => {
  if (typeof value !== 'string') return '';
  return value.length > maxLen ? value.slice(0, maxLen) : value;
};

const buildPrompt = (req: AiActionRequest) => {
  const prompt = clampString(req.prompt, MAX_INPUT_CHARS);
  const context = clampString(req.context, MAX_INPUT_CHARS);

  let systemInstruction = 'You are a helpful writing assistant integrated into a markdown editor.';
  let contents = '';

  if (req.type === 'continue') {
    systemInstruction +=
      ' Continue the text naturally. Maintain the tone and style. Do not repeat the last sentence.';
    contents = `Context:\n${context}\n\nTask: Continue writing from here.`;
  } else if (req.type === 'summarize') {
    systemInstruction += ' Create a concise summary of the provided text.';
    contents = `Text to summarize:\n${context}`;
  } else if (req.type === 'improve') {
    systemInstruction +=
      ' Fix grammar, improve clarity, and make the tone more professional without changing the meaning.';
    contents = `Text to improve:\n${prompt || context}`;
  }

  return { systemInstruction, contents };
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const body = (await request.json()) as Partial<AiActionRequest>;
    if (!isAiActionType(body.type)) {
      return NextResponse.json(
        { error: 'Invalid request: missing/invalid type', requestId },
        { status: 400 }
      );
    }

    const prompt = clampString(body.prompt, MAX_INPUT_CHARS);
    const context = clampString(body.context, MAX_INPUT_CHARS);

    if (!context && !prompt) {
      return NextResponse.json(
        { error: 'Invalid request: missing prompt/context', requestId },
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
    const modelName = 'gemini-3-flash-preview';

    const { systemInstruction, contents } = buildPrompt({
      type: body.type,
      prompt,
      context,
    });

    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 1000,
      },
    });

    return NextResponse.json({
      requestId,
      text: response.text || '',
    });
  } catch (error) {
    // Avoid logging user content. Keep it minimal.
    console.error('AI action failed', { requestId, error });
    return NextResponse.json(
      { error: 'Failed to generate AI response', requestId },
      { status: 500 }
    );
  }
}
