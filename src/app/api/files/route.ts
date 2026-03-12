import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getLocalStorageRoot } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function guessContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

/**
 * Serves local fallback files from ./data when Blob storage is not configured.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedPath = searchParams.get("path");

  if (!requestedPath) {
    return NextResponse.json({ error: "path query parameter is required" }, { status: 400 });
  }

  const normalisedPath = path.posix.normalize(requestedPath.replace(/\\/g, "/"));
  if (!normalisedPath.startsWith("InvoiceScanner/") || normalisedPath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const absolute = path.join(getLocalStorageRoot(), normalisedPath);

  try {
    const buffer = await fs.readFile(absolute);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": guessContentType(absolute),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}

