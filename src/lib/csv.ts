import type { InvoiceRecord } from "./types";

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Converts invoice records to a CSV payload suitable for direct download.
 */
export function invoicesToCsv(records: InvoiceRecord[]): string {
  const headers = [
    "id",
    "date",
    "city",
    "country",
    "vendor",
    "category",
    "totalAmount",
    "currency",
    "taxAmount",
    "paymentMethod",
    "sourceFileName",
    "imagePath",
    "metadataPath",
    "createdAt",
    "updatedAt",
  ];

  const rows = records.map((record) =>
    [
      record.id,
      record.date,
      record.city,
      record.country,
      record.vendor,
      record.category,
      record.totalAmount.toString(),
      record.currency,
      record.taxAmount?.toString() ?? "",
      record.paymentMethod ?? "",
      record.sourceFileName,
      record.imagePath,
      record.metadataPath,
      record.createdAt,
      record.updatedAt,
    ]
      .map(escapeCsv)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

