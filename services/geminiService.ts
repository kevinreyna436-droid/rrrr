
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

// DEFENSIVE KEY LOADING
let apiKey = '';
try {
    // Rely on Vite replacement
    apiKey = process.env.API_KEY || '';
} catch (e) {
    console.warn("Could not read API_KEY from process.env");
}

if (!apiKey) {
  console.warn("API_KEY is missing. AI features will fail gracefully.");
}

// Initialize safely. If no key, put a dummy so the app doesn't crash on load, 
// but calls will fail later (which we catch).
const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

/**
 * Helper function to retry operations with exponential backoff.
 */
async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const nestedError = error?.error || error;
    const errorCode = nestedError?.status || nestedError?.code || error?.status || error?.code;
    const errorMessage = (nestedError?.message || error?.message || String(error)).toLowerCase();
    
    // Check if key is invalid/dummy
    if (errorMessage.includes('api key') || errorCode === 400 || errorCode === 403) {
        console.error("Invalid API Key. AI features disabled.");
        throw error; // Don't retry auth errors
    }

    const isQuotaError = 
        errorCode === 429 || 
        errorCode === 'RESOURCE_EXHAUSTED' || 
        errorMessage.includes('quota');
        
    const isTransientError = 
        errorCode === 503 || 
        errorMessage.includes('overloaded') || 
        isQuotaError;

    if (retries > 0 && isTransientError) {
      let waitTime = delay;
      if (isQuotaError) {
          console.warn(`⚠️ API Quota Hit. Pausing...`);
          waitTime = 10000; 
      }
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const extractFabricData = async (base64Data: string, mimeType: string) => {
  try {
    const prompt = `
    You are a specialized data extractor for a textile catalog "Creata Collection".
    Analyze the provided document/image.
    Identify FABRIC MODEL NAME, TECHNICAL SPECIFICATIONS (Composition, Weight, Martindale, Usage), and COLORS.
    Return JSON strictly.
    `;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            supplier: { type: Type.STRING },
            technicalSummary: { type: Type.STRING },
            colors: { type: Type.ARRAY, items: { type: Type.STRING } },
            specs: {
              type: Type.OBJECT,
              properties: {
                composition: { type: Type.STRING },
                martindale: { type: Type.STRING },
                usage: { type: Type.STRING },
                weight: { type: Type.STRING }
              }
            }
          }
        }
      }
    }));

    return JSON.parse(response.text || '{}');
  } catch (error: any) {
    console.warn("AI Extraction failed:", error?.message);
    return {
        name: "Unknown", 
        supplier: "Unknown",
        technicalSummary: "",
        colors: [],
        specs: {}
    };
  }
};

export const extractColorFromSwatch = async (base64Data: string): Promise<string | null> => {
    try {
        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: "Read the color name label from this image. Return JSON { colorName: string }." }
                ]
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: { colorName: { type: Type.STRING, nullable: true } }
                }
            }
        }));
        const result = JSON.parse(response.text || '{}');
        return result.colorName || null;
    } catch (error) {
        return null; 
    }
};

export const generateFabricDesign = async (prompt: string, aspectRatio: string = "1:1", size: string = "1K") => {
  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: `High quality fabric texture: ${prompt}` }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
          imageSize: size as any,
        }
      }
    }));
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
       if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error: any) {
    console.error("Error generating fabric:", error?.message);
    throw error;
  }
};

export const editFabricImage = async (base64Image: string, prompt: string) => {
  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: base64Image } },
          { text: prompt }
        ]
      }
    }));
     for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
   }
   return null;
  } catch (error: any) {
    console.error("Error editing fabric:", error?.message);
    throw error;
  }
};

export const chatWithExpert = async (message: string, history: any[]) => {
  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        ...history,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are a textile expert for Creata Collection."
      }
    }));

    const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = grounding?.map((chunk: any) => ({
      title: chunk.web?.title || 'Source',
      uri: chunk.web?.uri || '#'
    })) || [];

    return { text: response.text, sources };
  } catch (error: any) {
    console.error("Error in chat:", error?.message);
    return { text: "Lo siento, no puedo responder en este momento.", sources: [] };
  }
};
