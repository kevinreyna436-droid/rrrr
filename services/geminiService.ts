
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

// Ensure API Key is present
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

/**
 * Helper function to retry operations with exponential backoff.
 * Handles 503 (Service Unavailable) and 429 (Too Many Requests).
 */
async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const errorCode = error?.status || error?.code;
    const isTransientError = errorCode === 503 || errorCode === 429 || (error.message && error.message.includes('overloaded'));

    if (retries > 0 && isTransientError) {
      console.warn(`Gemini API overloaded or rate-limited (${errorCode}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Uploads a PDF or Image (base64) to extract Fabric Data.
 * Uses gemini-2.5-flash for efficiency.
 */
export const extractFabricData = async (base64Data: string, mimeType: string) => {
  try {
    const prompt = `
    You are a specialized data extractor for a textile catalog "Creata Collection".
    Analyze the provided document (PDF) or Image (Header Card).

    YOUR GOAL: Identify the main FABRIC MODEL NAME and TECHNICAL SPECS.

    CRITICAL RULES FOR "NAME":
    1. **FIND THE HEADER:** The Fabric Name is usually the largest, boldest text at the top of the PDF page or card.
    2. **IGNORE SUPPLIERS:** Do NOT use "Formatex", "Creata", "Textiles", "Home", "Decor" as the name. These are companies.
    3. **IGNORE COLLECTIONS:** Do NOT use "New Collection", "Water Repellent", "Easy Clean" as the name. These are features.
    4. **FORMAT:** Return ONLY the specific model name (e.g., "ALANIS", "BIKENDI", "SLATE"). Capitalize it.

    CRITICAL RULES FOR "SPECS":
    1. Extract the technical details and translate them to SPANISH.
    2. Look for "Composition", "Weight" (gr/m2), "Martindale" (cycles), and "Usage".

    Return JSON strictly adhering to this schema.
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
            name: { type: Type.STRING, description: "The specific model name (e.g. ALANIS). Not the company." },
            supplier: { type: Type.STRING, description: "The manufacturer name (e.g. Formatex)." },
            technicalSummary: { type: Type.STRING, description: "A summary in Spanish of the technical features." },
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
    console.error("Error extracting fabric data:", error?.message || String(error));
    throw error;
  }
};

/**
 * Extracts ONLY the color name from a specific swatch image.
 * Uses OCR capabilities of Gemini to read the text label on the photo.
 */
export const extractColorFromSwatch = async (base64Data: string): Promise<string | null> => {
    try {
        const prompt = `
        Analyze this fabric swatch image to find the COLOR NAME text label.

        CRITICAL LOCATION RULE:
        - The color name is almost ALWAYS located in the **BOTTOM RIGHT** corner of the physical label/card in the photo.
        - Sometimes it might be in the bottom left.
        
        EXTRACTION RULES:
        1. Look for a number followed by a name (e.g., "05 SAND", "102 ASH") or just a name (e.g. "NAVY").
        2. **IGNORE** company names (Formatex, Creata).
        3. **IGNORE** website URLs or long codes.
        4. Return **ONLY** the color name (and its number if present).
        5. If the text is fuzzy, make your best guess based on standard textile color names.
        `;

        const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        colorName: { type: Type.STRING, nullable: true }
                    }
                }
            }
        }));
        
        const result = JSON.parse(response.text || '{}');
        return result.colorName || null;

    } catch (error) {
        // Silently fail for individual colors to keep the process moving
        return null; 
    }
};

/**
 * Generates a new fabric design image.
 * Uses gemini-3-pro-image-preview.
 */
export const generateFabricDesign = async (prompt: string, aspectRatio: string = "1:1", size: string = "1K") => {
  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: `Generate a high-quality close-up texture image of a fabric: ${prompt}` }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio as any,
          imageSize: size as any,
        }
      }
    }));
    
    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
       if (part.inlineData) {
         return `data:image/png;base64,${part.inlineData.data}`;
       }
    }
    return null;
  } catch (error: any) {
    console.error("Error generating fabric:", error?.message || String(error));
    throw error;
  }
};

// enhanceFabricTexture function removed as requested to disable AI enhancement button/logic
export const enhanceFabricTexture = async (base64Image: string) => {
    return base64Image; // Pass-through stub
};

/**
 * Edits an existing fabric image using text prompts.
 * Uses gemini-2.5-flash-image.
 */
export const editFabricImage = async (base64Image: string, prompt: string) => {
  try {
    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Optimized for editing/multimodal
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: base64Image } },
          { text: prompt }
        ]
      }
    }));

     // Extract image
     for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
   }
   return null;
  } catch (error: any) {
    console.error("Error editing fabric:", error?.message || String(error));
    throw error;
  }
};

/**
 * Chatbot with Grounding.
 * Uses gemini-3-pro-preview + googleSearch.
 */
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
        systemInstruction: "You are a helpful expert assistant for 'Creata Collection', a premium fabric catalog. You help designers find trends, technical info, and fabric care advice. Respond in Spanish."
      }
    }));

    const text = response.text;
    const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    const sources = grounding?.map((chunk: any) => ({
      title: chunk.web?.title || 'Source',
      uri: chunk.web?.uri || '#'
    })) || [];

    return { text, sources };
  } catch (error: any) {
    console.error("Error in chat:", error?.message || String(error));
    return { text: "I'm having trouble connecting to the design studio. Please try again.", sources: [] };
  }
};
