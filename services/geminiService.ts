import { GoogleGenAI } from "@google/genai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: API_KEY
});

async function callGemini(model: string, contents: any) {
  return ai.models.generateContent({
    model,
    contents
  });
}

export const analyzeMedicalDocument = async (
  base64Data: string,
  mimeType: string
) => {

  const contents = [
    {
      inlineData: {
        data: base64Data,
        mimeType
      }
    },
    {
      text: "Extract medicines, dosage, frequency and explain simply. Return JSON."
    }
  ];

  try {

    // Primary model
    return await callGemini("gemini-2.0-flash", contents);

  } catch (err: any) {

    console.warn("Primary model failed. Trying fallback...");

    try {

      // Backup model
      return await callGemini("gemini-1.5-pro", contents);

    } catch (err2) {

      console.error("Fallback model failed");

      return {
        text: JSON.stringify({
          documentType: "Prescription",
          summary: "AI temporarily unavailable. Please try again shortly.",
          simplifiedTerms: [],
          criticalFindings: [],
          nextSteps: [
            "Retry analysis",
            "Ensure prescription image is clear"
          ]
        })
      };

    }
  }
};
