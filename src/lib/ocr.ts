import { recognize } from "tesseract.js";

/**
 * Runs OCR against an image buffer and returns raw text plus engine confidence.
 */
export async function extractTextFromImage(image: Buffer): Promise<{
  rawText: string;
  confidence: number;
}> {
  const result = await recognize(image, "eng");

  return {
    rawText: result.data.text ?? "",
    confidence: result.data.confidence ?? 0,
  };
}

