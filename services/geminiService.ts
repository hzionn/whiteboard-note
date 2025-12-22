import { GoogleGenAI } from "@google/genai";

const getAI = () => {
    // We assume the key is present as per requirements
    // In a real app, this should handle missing keys gracefully
    if (!process.env.API_KEY) {
        console.warn("API Key is missing for Gemini");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
};

export const generateCompletion = async (
  prompt: string, 
  context: string,
  type: 'continue' | 'summarize' | 'improve'
): Promise<string> => {
    try {
        const ai = getAI();
        const modelName = 'gemini-3-flash-preview';
        
        let systemInstruction = "You are a helpful writing assistant integrated into a markdown editor.";
        let finalPrompt = "";

        if (type === 'continue') {
            systemInstruction += " Continue the text naturally. Maintain the tone and style. Do not repeat the last sentence.";
            finalPrompt = `Context:\n${context}\n\nTask: Continue writing from here.`;
        } else if (type === 'summarize') {
            systemInstruction += " Create a concise summary of the provided text.";
            finalPrompt = `Text to summarize:\n${context}`;
        } else if (type === 'improve') {
            systemInstruction += " Fix grammar, improve clarity, and make the tone more professional without changing the meaning.";
            finalPrompt = `Text to improve:\n${prompt || context}`;
        }

        const response = await ai.models.generateContent({
            model: modelName,
            contents: finalPrompt,
            config: {
                systemInstruction: systemInstruction,
                maxOutputTokens: 1000,
            }
        });

        return response.text || "";
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw error;
    }
};
