const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models"

const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
]

/* ----------------------------- */
/* Convert image file to base64 */
/* ----------------------------- */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(",")[1]
      resolve(base64)
    }

    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* ----------------------------- */
/* Timeout helper */
/* ----------------------------- */

function timeout(ms: number) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("AI timeout")), ms)
  )
}

/* ----------------------------- */
/* Call Gemini */
/* ----------------------------- */

async function callGemini(model: string, body: any) {

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${model}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  )

  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}`)
  }

  const data = await response.json()

  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text || ""
  )
}

/* ----------------------------- */
/* Main AI Function */
/* ----------------------------- */

export async function analyzeMedicalDocument(file: File) {

  try {

    const base64Image = await fileToBase64(file)

    const prompt = `
You are a medical prescription analyzer.

Analyze this prescription image.

Return ONLY JSON in this format:

{
  "documentType": "",
  "summary": "",
  "simplifiedTerms": [],
  "criticalFindings": [],
  "medicines": [
    {
      "name": "",
      "dose": "",
      "purpose": ""
    }
  ]
}
`

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: file.type,
                data: base64Image
              }
            }
          ]
        }
      ]
    }

    /* Try multiple models */

    for (const model of MODELS) {

      try {

        console.log(`Trying Gemini model: ${model}`)

        const result = await Promise.race([
          callGemini(model, body),
          timeout(10000)
        ])

        if (result) {

          try {
            return JSON.parse(result)
          } catch {

            return {
              documentType: "Prescription",
              summary: result,
              simplifiedTerms: [],
              criticalFindings: [],
              medicines: [],
              nextSteps: []
            }

          }

        }

      } catch (err) {

        console.warn(`Model ${model} failed`, err)

      }

    }

    /* If all models fail */

    return {
      documentType: "Prescription",
      summary:
        "AI temporarily unavailable. Please try again.",
      simplifiedTerms: [],
      criticalFindings: [],
      medicines: [],
      nextSteps: [
        "Retry analysis",
        "Ensure prescription image is clear"
      ]
    }

  } catch (error) {

    console.error("Analysis failed:", error)

    return {
      documentType: "Unknown",
      summary: "Unable to process image.",
      simplifiedTerms: [],
      criticalFindings: [],
      medicines: [],
      nextSteps: [
        "Upload a clearer image",
        "Retry analysis"
      ]
    }

  }

}
