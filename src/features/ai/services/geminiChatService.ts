export type ChatRole = 'user' | 'model';

export type ChatMessage = {
  role: ChatRole;
  text: string;
};

export type NoteContext = {
  id: string;
  title: string;
  content: string;
};

type AiChatResponse = {
  text?: string;
  error?: string;
};

export const sendChatMessage = async (args: {
  messages: ChatMessage[];
  systemInstruction?: string;
  noteContext?: NoteContext[];
}): Promise<string> => {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: args.messages,
      systemInstruction: args.systemInstruction,
      noteContext: args.noteContext,
    }),
  });

  if (!res.ok) {
    let message = 'AI chat request failed';
    try {
      const data = (await res.json()) as AiChatResponse;
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = (await res.json()) as AiChatResponse;
  return data.text || '';
};
