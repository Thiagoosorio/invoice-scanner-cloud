import { NextResponse } from "next/server";

import { deleteInvoice, listInvoices } from "@/lib/storage";
import type { ExpenseCategory } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns invoice records with optional city/category/date filters.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const invoices = await listInvoices({
    city: searchParams.get("city") || undefined,
    category: (searchParams.get("category") as ExpenseCategory | null) || undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
  });

  return NextResponse.json({ invoices });
}

/**
 * Deletes one invoice by id using metadata lookup from the current list.
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("id");

  if (!invoiceId) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  const invoices = await listInvoices();
  const target = invoices.find((invoice) => invoice.id === invoiceId);

  if (!target) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  await deleteInvoice(target);
  return NextResponse.json({ ok: true });
}

