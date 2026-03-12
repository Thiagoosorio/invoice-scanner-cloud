import path from "node:path";

import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

/**
 * Lazily creates a shared Tesseract worker to avoid per-request startup cost.
 */
async function getWorker(): Promise<Worker> {
  if (workerPromise) {
    return workerPromise;
  }

  workerPromise = createWorker("eng", 1, {
    workerPath: path.join(
      process.cwd(),
      "node_modules",
      "tesseract.js",
      "src",
      "worker-script",
      "node",
      "index.js",
    ),
  });

  return workerPromise;
}

/**
 * Runs OCR against an image buffer and returns raw text plus engine confidence.
 */
export async function extractTextFromImage(image: Buffer): Promise<{
  rawText: string;
  confidence: number;
}> {
  const worker = await getWorker();
  const result = await worker.recognize(image);

  return {
    rawText: result.data.text ?? "",
    confidence: result.data.confidence ?? 0,
  };
}
