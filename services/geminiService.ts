
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

// Ensure API Key is present
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

/**
 * Helper function to retry operations with exponential backoff.
 * Handles 503 (Service Unavailable) and 429 (Too Many Requests / Quota).
 */
async function retryWithBackoff<T>(operation: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // PARSE ERROR: Check for nested error structures often returned by the library/API
    const nestedError = error?.error || error;
    const errorCode = nestedError?.status || nestedError?.code || error?.status || error?.code;
    const errorMessage = (nestedError?.message || error?.message || String(error)).toLowerCase();
    
    // DETECT QUOTA ISSUES
    const isQuotaError = 
        errorCode === 429 || 
        errorCode === 'RESOURCE_EXHAUSTED' || 
        errorMessage.includes('quota') || 
        errorMessage.includes('exhausted') ||
        errorMessage.includes('429');
        
    const isTransientError = 
        errorCode === 503 || 
        errorMessage.includes('overloaded') || 
        isQuotaError;

    if (retries > 0 && isTransientError) {
      let waitTime = delay;
      
      if (isQuotaError) {
          console.warn(`⚠️ API Quota Hit (429). Pausing for 70 seconds to recover...`);
          waitTime = 70000; // Increased to 70s to be safer against strict limits
      } else {
          console.warn(`Gemini API busy (${errorCode}). Retrying in ${waitTime/1000}s...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // If it's a quota error, we stick to the long wait.
      // If it's another error, we double the delay.
      const nextDelay = isQuotaError ? 70000 : delay * 2;
      
      return retryWithBackoff(operation, retries - 1, nextDelay);
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

    YOUR GOAL: STRICTLY Identify the FABRIC MODEL NAME and TECHNICAL SPECIFICATIONS.

    CRITICAL RULES FOR "NAME":
    1. **FIND THE HEADER:** The Fabric Name is usually the largest, boldest text.
    2. **EXCLUSIONS:** Do NOT use "Formatex", "Creata", "Textiles", "Home", "Decor", "Collection" as the name.
    3. **FORMAT:** Return ONLY the specific model name (e.g., "ALANIS", "BIKENDI"). Capitalize it.
    4. If no specific model name is found, return "Unknown".

    CRITICAL RULES FOR "SPECS" (MANDATORY):
    1. You MUST find technical details: "Composition", "Weight" (Peso), "Martindale" (Abrasion), or "Usage".
    2. Translate values to Spanish.
    3. If the document DOES NOT contain technical specs, leave the specs fields empty. This is used to filter out invalid files.

    CRITICAL RULES FOR "COLORS":
    1. Scan the text for a list of colors if available.

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
            name: { type: Type.STRING, description: "The specific model name (e.g. ALANIS). Return 'Unknown' if not found." },
            supplier: { type: Type.STRING, description: "The manufacturer name (e.g. Formatex)." },
            technicalSummary: { type: Type.STRING, description: "A summary in Spanish of the technical features." },
            colors: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of color names found in the text." },
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
    // Graceful fallback for Quota Exhausted or Extraction errors
    console.warn("AI Extraction skipped (Quota/Error). Using manual entry fallback.", error?.message);
    return {
        name: "Unknown", 
        supplier: "Unknown",
        technicalSummary: "",
        colors: [],
        specs: {}
    };
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
        
        EXTRACTION RULES:
        1. Look for a number followed by a name (e.g., "05 SAND") or just a name.
        2. **IGNORE** company names (Formatex, Creata).
        3. Return **ONLY** the color name (e.g. "Sand").
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
