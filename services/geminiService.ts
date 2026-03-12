// gemini.service.ts
import { GoogleGenAI, Type } from "@google/genai";
import { MedicalAnalysis } from "../types.ts";

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
  try {
    // Use free-tier model
    const ai = new GoogleGenAI({
      apiKey: process.env.VITE_GEMINI_API_KEY
    });

    const response = await ai.models.generateContent({
      model: 'gemini-1.5', // free-tier model
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        {
          text: `Analyze this medical document (prescription, bill, or lab report).
- Context: Patient in a ${cityTier} city in India.
- Identify document type.
- Extract all medicines, strengths, frequencies, durations.
- Explain medical jargon in plain English.
- Suggest generic alternatives if branded medicines are present.
- Flag unusually high charges or unnecessary fees.
- Provide actionable next steps.
- ALWAYS output valid JSON matching the schema strictly.
- Include a confidence score for each medicine.
- Add clear disclaimer: "Consult your doctor before making changes to medication."`
        }
      ],
      config: {
        systemInstruction: "You are an expert Indian Medical Consultant. Provide accurate, empathetic, structured insights in JSON format.",
        responseMimeType: 'application/json',
        responseSchema: ANALYSIS_SCHEMA
      }
    });

    if (!response.text) {
      console.error('Gemini response empty');
      throw new Error("No analysis generated.");
    }

    try {
      return JSON.parse(response.text) as MedicalAnalysis;
    } catch {
      console.error('Failed to parse Gemini JSON:', response.text);
      throw new Error("Invalid analysis result. Try again.");
    }
  } catch (err: any) {
    if (err.code === 429) {
      console.warn('Rate limit hit for free-tier model, retry after a short delay.');
    } else {
      console.error('Gemini Analysis Error:', err);
    }
    throw err;
  }
};
