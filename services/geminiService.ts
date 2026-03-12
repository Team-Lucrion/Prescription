// gemini.service.ts
import { GoogleGenAI, Type } from "@google/genai";
import { MedicalAnalysis } from "../types.ts";

// Get API key correctly from Vite env
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// JSON schema for AI output
const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentType: { type: Type.STRING },
    summary: { type: Type.STRING },
    simplifiedTerms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          jargon: { type: Type.STRING },
          meaning: { type: Type.STRING },
          importance: { type: Type.STRING }
        }
      }
    },
    criticalFindings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          issue: { type: Type.STRING },
          description: { type: Type.STRING },
          action: { type: Type.STRING }
        }
      }
    },
    genericAlternatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          brandedName: { type: Type.STRING },
          genericName: { type: Type.STRING },
          approxBrandedPrice: { type: Type.STRING },
          approxGenericPrice: { type: Type.STRING },
          savingsPercentage: { type: Type.STRING }
        }
      }
    },
    costInsights: {
      type: Type.OBJECT,
      properties: {
        procedureName: { type: Type.STRING },
        billedAmount: { type: Type.STRING },
        expectedRange: {
          type: Type.OBJECT,
          properties: {
            privateLow: { type: Type.STRING },
            privateHigh: { type: Type.STRING },
            government: { type: Type.STRING }
          }
        },
        isOvercharged: { type: Type.BOOLEAN },
        tierComparison: { type: Type.STRING }
      },
      required: ['procedureName', 'expectedRange', 'isOvercharged', 'tierComparison']
    },
    nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ['documentType', 'summary', 'simplifiedTerms', 'criticalFindings', 'nextSteps']
};

export const analyzeMedicalDocument = async (
  base64Data: string,
  mimeType: string,
  cityTier: string = 'Tier-1'
): Promise<MedicalAnalysis> => {

  if (!API_KEY) {
    throw new Error("Gemini API key missing. Check Netlify env variables.");
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: API_KEY
    });

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash", // best free-tier model
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        {
          text: `Analyze this medical document (prescription, bill, or lab report).

Context: Patient in a ${cityTier} city in India.

Tasks:
- Identify document type
- Extract medicines, dosage, frequency, duration
- Explain medical jargon simply
- Suggest generic alternatives if branded medicines exist
- Detect unusual charges
- Provide clear next steps

Rules:
- ALWAYS return valid JSON matching schema
- Be medically cautious
- Add disclaimer: "Consult your doctor before changing medication."`
        }
      ],
      config: {
        systemInstruction:
          "You are an expert Indian medical analyst. Provide safe, structured explanations.",
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA
      }
    });

    if (!response.text) {
      throw new Error("No analysis generated.");
    }

    return JSON.parse(response.text) as MedicalAnalysis;

  } catch (err: any) {
    console.error("Gemini error:", err);
    throw err;
  }
};
