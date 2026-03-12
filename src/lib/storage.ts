import { promises as fs } from "node:fs";
import path from "node:path";

import { del, list, put } from "@vercel/blob";
import { parseISO } from "date-fns";

import type { InvoiceListFilters, InvoiceRecord } from "./types";

const ROOT_PREFIX = "InvoiceScanner";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function hasBlobStorage(): boolean {
  return Boolean(BLOB_TOKEN);
}

function localDataRoot(): string {
  return path.join(process.cwd(), "data");
}

function toSafeCitySegment(city: string): string {
  return city
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^$/, "Unknown_City");
}

function toSafeDateSegment(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  return "Unknown_Date";
}

function extensionFromContentType(contentType: string, fallback: string): string {
  if (fallback) {
    return fallback.toLowerCase();
  }
  const match = contentType.match(/image\/([a-zA-Z0-9]+)/);
  if (!match) {
    return "jpg";
  }
  if (match[1] === "jpeg") {
    return "jpg";
  }
  return match[1].toLowerCase();
}

function toJsonBlobPath(record: InvoiceRecord): string {
  return `${ROOT_PREFIX}/${toSafeCitySegment(record.city)}/${toSafeDateSegment(record.date)}/invoice_${record.id}.json`;
}

function toImageBlobPath(record: InvoiceRecord, extension: string): string {
  return `${ROOT_PREFIX}/${toSafeCitySegment(record.city)}/${toSafeDateSegment(record.date)}/invoice_${record.id}.${extension}`;
}

/**
 * Saves image and metadata in either Vercel Blob (cloud) or local filesystem (fallback dev mode).
 */
export async function saveInvoiceRecord(params: {
  invoice: InvoiceRecord;
  imageBuffer: Buffer;
  fileExtension: string;
  mimeType: string;
}): Promise<InvoiceRecord> {
  const extension = extensionFromContentType(params.mimeType, params.fileExtension);
  const imagePath = toImageBlobPath(params.invoice, extension);
  const metadataPath = toJsonBlobPath(params.invoice);

  if (hasBlobStorage()) {
    const imageBlob = await put(imagePath, params.imageBuffer, {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
      contentType: params.mimeType || "image/jpeg",
    });

    const storedRecord: InvoiceRecord = {
      ...params.invoice,
      imagePath,
      metadataPath,
      imageUrl: imageBlob.url,
      updatedAt: new Date().toISOString(),
    };

    await put(metadataPath, JSON.stringify(storedRecord, null, 2), {
      access: "public",
      addRandomSuffix: false,
      token: BLOB_TOKEN,
      contentType: "application/json",
    });

    return storedRecord;
  }

  const absoluteImagePath = path.join(localDataRoot(), imagePath);
  const absoluteMetadataPath = path.join(localDataRoot(), metadataPath);

  await fs.mkdir(path.dirname(absoluteImagePath), { recursive: true });
  await fs.writeFile(absoluteImagePath, params.imageBuffer);

  const imageUrl = `/api/files?path=${encodeURIComponent(imagePath)}`;
  const storedRecord: InvoiceRecord = {
    ...params.invoice,
    imagePath,
    metadataPath,
    imageUrl,
    updatedAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(absoluteMetadataPath), { recursive: true });
  await fs.writeFile(absoluteMetadataPath, JSON.stringify(storedRecord, null, 2), "utf8");

  return storedRecord;
}

async function listBlobJsonPaths(): Promise<string[]> {
  const results: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({
      prefix: `${ROOT_PREFIX}/`,
      cursor,
      token: BLOB_TOKEN,
      limit: 1000,
    });

    for (const blob of page.blobs) {
      if (blob.pathname.endsWith(".json")) {
        results.push(blob.url);
      }
    }

    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  return results;
}

async function readBlobInvoices(): Promise<InvoiceRecord[]> {
  const jsonUrls = await listBlobJsonPaths();
  const records = await Promise.all(
    jsonUrls.map(async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      const parsed = (await response.json()) as InvoiceRecord;
      return parsed;
    }),
  );
  return records.filter((record): record is InvoiceRecord => record !== null);
}

async function collectLocalJsonFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectLocalJsonFiles(absolutePath);
      files.push(...nested);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(absolutePath);
    }
  }

  return files;
}

async function readLocalInvoices(): Promise<InvoiceRecord[]> {
  const baseDir = path.join(localDataRoot(), ROOT_PREFIX);
  try {
    await fs.access(baseDir);
  } catch {
    return [];
  }

  const jsonFiles = await collectLocalJsonFiles(baseDir);
  const records = await Promise.all(
    jsonFiles.map(async (jsonFile) => {
      try {
        const raw = await fs.readFile(jsonFile, "utf8");
        return JSON.parse(raw) as InvoiceRecord;
      } catch {
        return null;
      }
    }),
  );

  return records.filter((record): record is InvoiceRecord => record !== null);
}

function matchesFilters(record: InvoiceRecord, filters?: InvoiceListFilters): boolean {
  if (!filters) {
    return true;
  }

  if (filters.city && record.city.toLowerCase() !== filters.city.toLowerCase()) {
    return false;
  }

  if (filters.category && record.category !== filters.category) {
    return false;
  }

  if (filters.dateFrom && record.date < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && record.date > filters.dateTo) {
    return false;
  }

  return true;
}

/**
 * Lists invoice records and applies optional city/category/date filters.
 */
export async function listInvoices(filters?: InvoiceListFilters): Promise<InvoiceRecord[]> {
  const records = hasBlobStorage() ? await readBlobInvoices() : await readLocalInvoices();

  return records
    .filter((record) => matchesFilters(record, filters))
    .sort((left, right) => {
      const leftDate = parseISO(left.createdAt).getTime();
      const rightDate = parseISO(right.createdAt).getTime();
      return rightDate - leftDate;
    });
}

/**
 * Deletes one invoice by removing both image and metadata objects from storage.
 */
export async function deleteInvoice(record: InvoiceRecord): Promise<void> {
  if (hasBlobStorage()) {
    await del([record.imagePath, record.metadataPath], { token: BLOB_TOKEN });
    return;
  }

  const imageAbsolute = path.join(localDataRoot(), record.imagePath);
  const metadataAbsolute = path.join(localDataRoot(), record.metadataPath);

  await Promise.all([
    fs.unlink(imageAbsolute).catch(() => undefined),
    fs.unlink(metadataAbsolute).catch(() => undefined),
  ]);
}

/**
 * Exposes the local storage root so file-serving routes can read dev fallback assets.
 */
export function getLocalStorageRoot(): string {
  return localDataRoot();
}

