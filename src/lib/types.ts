export type ExpenseCategory =
  | "transport"
  | "food"
  | "accommodation"
  | "fuel"
  | "parking"
  | "telecom"
  | "office_supplies"
  | "entertainment"
  | "other";

export type FieldConfidence = Record<
  "totalAmount" | "currency" | "category" | "vendor" | "date" | "city" | "country",
  number
>;

export interface ParsedInvoiceFields {
  totalAmount: number;
  currency: string;
  category: ExpenseCategory;
  vendor: string;
  date: string;
  city: string;
  country: string;
  taxAmount: number | null;
  paymentMethod: string | null;
  notes: string | null;
  rawText: string;
  confidence: FieldConfidence;
}

export interface InvoiceRecord extends ParsedInvoiceFields {
  id: string;
  sourceFileName: string;
  imageUrl: string;
  imagePath: string;
  metadataPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceListFilters {
  city?: string;
  category?: ExpenseCategory;
  dateFrom?: string;
  dateTo?: string;
}

