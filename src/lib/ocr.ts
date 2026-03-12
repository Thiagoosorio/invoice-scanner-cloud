import path from "node:path";
import { existsSync } from "node:fs";

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
    langPath: existsSync(path.join(process.cwd(), "tessdata", "eng.traineddata"))
      ? path.join(process.cwd(), "tessdata")
      : undefined,
    cachePath: path.join(process.env.TEMP || process.env.TMPDIR || "/tmp", "tesseract-cache"),
    gzip: false,
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
