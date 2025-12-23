export const generateCompletion = async (
  prompt: string,
  context: string,
  type: 'continue' | 'summarize' | 'improve'
): Promise<string> => {
  const res = await fetch('/api/ai/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, prompt, context }),
  });

  if (!res.ok) {
    let message = 'AI request failed';
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = (await res.json()) as { text?: string };
  return data.text || '';
};
