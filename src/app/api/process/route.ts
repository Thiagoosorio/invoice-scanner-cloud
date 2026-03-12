import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { extractTextFromImage } from "@/lib/ocr";
import { parseInvoiceText } from "@/lib/parser";
import { saveInvoiceRecord } from "@/lib/storage";
import type { InvoiceRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionalString = (maxLength: number) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") {
        return undefined;
      }
      return value;
    },
    z.string().trim().max(maxLength).optional(),
  );

const formSchema = z.object({
  fallbackCurrency: z.preprocess(
    (value) => (value === null || value === undefined || value === "" ? "USD" : value),
    z.string().trim().min(3).max(3),
  ),
  cityOverride: optionalString(100),
  notes: optionalString(2000),
});

function extensionFromName(name: string): string {
  const parts = name.split(".");
  if (parts.length < 2) {
    return "jpg";
  }
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Accepts one uploaded image, runs OCR + parsing, and stores image+metadata under city/date paths.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file field is required." }, { status: 400 });
    }

    const parsedForm = formSchema.safeParse({
      fallbackCurrency: formData.get("fallbackCurrency"),
      cityOverride: formData.get("cityOverride"),
      notes: formData.get("notes"),
    });

    if (!parsedForm.success) {
      return NextResponse.json(
        { error: "Invalid input.", details: parsedForm.error.flatten() },
        { status: 400 },
      );
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const ocr = await extractTextFromImage(imageBuffer);
    const parsedFields = parseInvoiceText({
      rawText: ocr.rawText,
      ocrConfidence: ocr.confidence,
      fallbackCurrency: parsedForm.data.fallbackCurrency,
      cityOverride: parsedForm.data.cityOverride,
      notes: parsedForm.data.notes,
    });

    const nowIso = new Date().toISOString();
    const invoice: InvoiceRecord = {
      id: randomUUID(),
      sourceFileName: file.name,
      imageUrl: "",
      imagePath: "",
      metadataPath: "",
      createdAt: nowIso,
      updatedAt: nowIso,
      ...parsedFields,
    };

    const persisted = await saveInvoiceRecord({
      invoice,
      imageBuffer,
      fileExtension: extensionFromName(file.name),
      mimeType: file.type || "image/jpeg",
    });

    return NextResponse.json({ invoice: persisted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
