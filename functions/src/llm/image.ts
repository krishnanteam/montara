import { GoogleGenAI } from "@google/genai";

let cachedAI: GoogleGenAI | null = null;

function getGenAI(apiKey: string): GoogleGenAI {
  if (!cachedAI) {
    cachedAI = new GoogleGenAI({ apiKey });
  }
  return cachedAI;
}

/**
 * Transcribe text from an image using Gemini multimodal.
 * Phase 0: OCR only — no entity extraction.
 */
export async function transcribeImage(
  apiKey: string,
  imageBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const ai = getGenAI(apiKey);
  const base64Image = imageBuffer.toString("base64");

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `This is a screenshot related to real estate. Transcribe ALL text visible in the image exactly as written. If the image is a text conversation (iMessage, WhatsApp, etc.), format it as a conversation with speaker labels. If it's a document or listing, transcribe the content preserving structure. Return only the transcribed text, nothing else.`,
          },
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
  });

  return response.text ?? "";
}
