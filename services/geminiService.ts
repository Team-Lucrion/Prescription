import { GoogleGenAI } from "@google/genai";
import { MedicalAnalysis } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("Missing Gemini API key. Set VITE_GEMINI_API_KEY in .env");
}

const ai = new GoogleGenAI({ apiKey });

export const analyzeMedicalDocument = async (
  base64Image: string,
  mimeType: string,
  cityTier: string
): Promise<MedicalAnalysis> => {
  const prompt = `
You are a medical document analysis assistant.
Analyze the uploaded medical document (prescription, bill, or lab report).
Return the result ONLY in JSON format with this structure:
{
  "documentType": "PRESCRIPTION | BILL | LAB_REPORT | OTHER",
  "summary": "Short summary of the document",
  "keyFindings": ["important point 1","important point 2"],
  "costInsights": "Explain cost relevance for ${cityTier} cities in India",
  "recommendations": ["recommendation 1","recommendation 2"]
}
Important rules:
- Use simple English
- Be accurate
- If handwriting is unclear, mention it
- Only return JSON
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Image,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
    });

    const text = response.text ?? "";
    const clean = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(clean);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Medical document analysis failed.");
  }
};
