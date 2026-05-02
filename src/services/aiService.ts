import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface DetectedObject {
  label: string;
  confidence: number;
}

export interface AIAnalysis {
  objects: DetectedObject[];
  emotions: string[];
  suggestions: string[];
  suggestedText: string[];
}

export async function analyzeImage(base64Image: string, mimeType: string): Promise<AIAnalysis> {
  const prompt = `
    Analyze this image and provide:
    1. A list of detectable objects with confidence levels.
    2. Any face emotions detected (if applicable).
    3. 3 suggestions for creative edits or raw material overlays.
    4. 3 suggested text captions that would look good on this photo.
    
    Return the response as a clear JSON object with keys: objects (array of {label, confidence}), emotions (array of strings), suggestions (array of strings), suggestedText (array of strings).
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { inlineData: { data: base64Image, mimeType } },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json"
      }
    });

    const result = JSON.parse(response.text || "{}");
    return {
      objects: result.objects || [],
      emotions: result.emotions || [],
      suggestions: result.suggestions || [],
      suggestedText: result.suggestedText || []
    };
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw error;
  }
}
