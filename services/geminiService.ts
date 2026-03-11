import { GoogleGenAI, Type } from "@google/genai";
import { MedicalAnalysis } from "../types";

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

    medicines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          strength: { type: Type.STRING },
          frequency: { type: Type.STRING },
          duration: { type: Type.STRING },
          confidence: { type: Type.STRING }
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
      }
    },

    nextSteps: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },

  required: [
    "documentType",
    "summary",
    "simplifiedTerms",
    "criticalFindings",
    "nextSteps"
  ]
};

export const analyzeMedicalDocument = async (
  base64Data: string,
  mimeType: string,
  cityTier: string = "Tier-1"
): Promise<MedicalAnalysis> => {
  try {

    const ai = new GoogleGenAI({
      apiKey: import.meta.env.VITE_GEMINI_API_KEY
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",

      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },

          {
            text: `
You are an expert Indian medical document analyst specializing in handwritten doctor prescriptions, lab reports, and hospital bills.

The document may contain messy handwriting, unclear abbreviations, or partial text.

Follow this analysis process carefully.

STEP 1 — Identify document type:
Determine if the document is:
- Prescription
- Lab Report
- Hospital Bill
- Insurance Rejection
- Other medical document

STEP 2 — Carefully read the document:
Mentally zoom into each section of the image and extract visible information.

STEP 3 — Extract medicines if present:
For each medicine identify:
- Name
- Strength (mg/ml if visible)
- Frequency (once daily, twice daily, etc)
- Duration if written

If handwriting is unclear mark fields as "uncertain".

STEP 4 — Normalize medicine names:
Convert branded medicines into generic medicines if possible.
Suggest Jan Aushadhi alternatives where applicable with estimated savings in INR.

STEP 5 — Explain medical terms:
Simplify complex medical terms into plain English understandable by patients.

STEP 6 — Detect critical findings:
Highlight any:
- antibiotics
- steroids
- strong medications
- abnormal lab values
Explain why attention is needed.

STEP 7 — Analyze costs if document is a bill:
Compare costs with typical Indian hospital ranges for ${cityTier} cities.

Example reference ranges:
Cataract surgery ₹20k–40k
C-Section ₹60k–1L
Dialysis ₹2500–5000

Flag possible overcharging or unnecessary fees.

STEP 8 — Provide safe next steps for the patient.

STEP 9 — Always include this safety disclaimer:
"Consult your doctor before making any changes to medication."

IMPORTANT RULES:
- Never invent medicines that are not visible.
- If information is unclear mark it as uncertain.
- Return strictly valid JSON matching the schema.

Context: Patient is located in a ${cityTier} city in India.
`
          }
        ]
      },

      config: {
        systemInstruction:
          "You are a careful, accurate medical AI assistant helping patients understand prescriptions and medical documents safely.",

        responseMimeType: "application/json",

        responseSchema: ANALYSIS_SCHEMA
      }
    });

    const text = response.text;

    if (!text) {
      throw new Error("No response from Gemini.");
    }

    try {
      return JSON.parse(text) as MedicalAnalysis;
    } catch (error) {
      console.error("Gemini returned invalid JSON:", text);
      throw new Error("AI response format invalid.");
    }

  } catch (err) {
    console.error("Gemini analysis failed:", err);
    throw err;
  }
};
