const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models"

const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
]

// Simple medicine dataset (can expand later or load from JSON)
const MEDICINE_DB: Record<string, { use: string; dose: string }> = {
  paracetamol: {
    use: "Used to treat fever and mild pain",
    dose: "Common dose: 500mg"
  },
  crocin: {
    use: "Fever and pain relief (Paracetamol brand)",
    dose: "Common dose: 500mg"
  },
  amoxicillin: {
    use: "Antibiotic used for bacterial infections",
    dose: "Typical adult dose: 250-500mg"
  },
  ibuprofen: {
    use: "Pain relief and inflammation reduction",
    dose: "Common dose: 200-400mg"
  }
}

// Timeout protection
function timeout(ms: number) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI timeout")), ms)
  )
}

// Gemini API call
async function callGemini(model: string, contents: any) {

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents
      })
    }
  )

  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}`)
  }

  const data = await response.json()

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || ""

  return text
}

// Extract medicine names from text
function detectMedicines(text: string) {

  const found: any[] = []

  const lower = text.toLowerCase()

  for (const med in MEDICINE_DB) {
    if (lower.includes(med)) {
      found.push({
        name: med,
        ...MEDICINE_DB[med]
      })
    }
  }

  return found
}

// Local fallback analysis
function localPrescriptionAnalysis(text: string) {

  const medicines = detectMedicines(text)

  return {
    documentType: "Prescription",
    summary:
      medicines.length > 0
        ? "Basic prescription analysis (AI unavailable)"
        : "Prescription detected but medicines could not be confidently identified.",
    simplifiedTerms: medicines.map(m => ({
      term: m.name,
      explanation: m.use
    })),
    criticalFindings: [],
    nextSteps: [
      "Consult your doctor before taking medicines",
      "Verify dosage instructions",
      "Retry AI analysis later"
    ]
  }
}

// Main function
export async function runPrescriptionAI(contents: any) {

  for (const model of MODELS) {

    try {

      console.log(`Trying model: ${model}`)

      const result = await Promise.race([
        callGemini(model, contents),
        timeout(8000)
      ])

      if (result) {

        try {
          return JSON.parse(result)
        } catch {

          // If AI returned plain text
          return {
            documentType: "Prescription",
            summary: result,
            simplifiedTerms: [],
            criticalFindings: [],
            nextSteps: []
          }
        }

      }

    } catch (error) {

      console.warn(`Model ${model} failed`, error)

    }

  }

  // AI failed → use local dataset fallback
  console.warn("All AI models failed. Using local medicine dataset.")

  const textInput =
    contents?.[0]?.parts?.[0]?.text ||
    JSON.stringify(contents)

  return localPrescriptionAnalysis(textInput)

}
