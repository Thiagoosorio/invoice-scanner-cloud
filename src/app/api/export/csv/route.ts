import { NextResponse } from "next/server";

import { invoicesToCsv } from "@/lib/csv";
import { listInvoices } from "@/lib/storage";
import type { ExpenseCategory } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Exports filtered invoices as CSV.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoices = await listInvoices({
    city: searchParams.get("city") || undefined,
    category: (searchParams.get("category") as ExpenseCategory | null) || undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
  });

  const csv = invoicesToCsv(invoices);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

