import { format, isValid, parse } from "date-fns";

import { CITY_TO_COUNTRY } from "./constants";
import { detectCategory } from "./categoriser";
import type { FieldConfidence, ParsedInvoiceFields } from "./types";

const ISO_CURRENCY_CODES = ["USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "SGD", "AED"];

function parseAmountToken(token: string): number | null {
  const stripped = token.replace(/[^\d.,-]/g, "");
  if (!stripped) {
    return null;
  }

  const hasComma = stripped.includes(",");
  const hasDot = stripped.includes(".");
  let normalised = stripped;

  if (hasComma && hasDot) {
    const lastComma = stripped.lastIndexOf(",");
    const lastDot = stripped.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalised = stripped.replace(/\./g, "").replace(",", ".");
    } else {
      normalised = stripped.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    normalised = stripped.replace(",", ".");
  }

  const value = Number.parseFloat(normalised);
  if (Number.isNaN(value)) {
    return null;
  }

  return value;
}

function extractCurrency(text: string, fallbackCurrency: string): string {
  const upperText = text.toUpperCase();

  for (const code of ISO_CURRENCY_CODES) {
    if (upperText.includes(code)) {
      return code;
    }
  }

  if (text.includes("$")) {
    return "USD";
  }
  if (text.includes("\u20AC")) {
    return "EUR";
  }
  if (text.includes("\u00A3")) {
    return "GBP";
  }
  if (text.includes("\u00A5")) {
    return "JPY";
  }

  return fallbackCurrency.toUpperCase();
}

function parseDateFromLine(line: string): string | null {
  const candidatePatterns = [
    { regex: /\b(\d{4}-\d{2}-\d{2})\b/, format: "yyyy-MM-dd" },
    { regex: /\b(\d{2}\/\d{2}\/\d{4})\b/, format: "dd/MM/yyyy" },
    { regex: /\b(\d{2}-\d{2}-\d{4})\b/, format: "dd-MM-yyyy" },
    { regex: /\b(\d{2}\.\d{2}\.\d{4})\b/, format: "dd.MM.yyyy" },
    { regex: /\b(\d{4}\/\d{2}\/\d{2})\b/, format: "yyyy/MM/dd" },
  ] as const;

  for (const { regex, format: candidateFormat } of candidatePatterns) {
    const match = line.match(regex);
    if (!match) {
      continue;
    }
    const parsed = parse(match[1], candidateFormat, new Date());
    if (!isValid(parsed)) {
      continue;
    }
    return format(parsed, "yyyy-MM-dd");
  }

  return null;
}

function extractDate(lines: string[]): string {
  for (const line of lines) {
    const parsed = parseDateFromLine(line);
    if (parsed) {
      return parsed;
    }
  }
  return format(new Date(), "yyyy-MM-dd");
}

function extractVendor(lines: string[]): string {
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length < 2 || line.length > 70) {
      continue;
    }
    if (/^\d+$/.test(line)) {
      continue;
    }
    if (/invoice|receipt|tax|vat|total|amount|date/i.test(line)) {
      continue;
    }
    return line;
  }
  return "Unknown Vendor";
}

function extractCityAndCountry(text: string, cityOverride?: string): { city: string; country: string } {
  if (cityOverride && cityOverride.trim().length > 0) {
    const cleanCity = toTitleCase(cityOverride.trim());
    const country = CITY_TO_COUNTRY[cityOverride.trim().toLowerCase()] ?? "UN";
    return { city: cleanCity, country };
  }

  const lowerText = text.toLowerCase();
  for (const [city, country] of Object.entries(CITY_TO_COUNTRY)) {
    if (lowerText.includes(city)) {
      return { city: toTitleCase(city), country };
    }
  }

  const isoCountryMatch = text.toUpperCase().match(/\b([A-Z]{2})\b/g);
  if (isoCountryMatch && isoCountryMatch.length > 0) {
    const country = isoCountryMatch.find((item) => item !== "ID" && item !== "NO") ?? "UN";
    return { city: "Unknown City", country };
  }

  return { city: "Unknown City", country: "UN" };
}

function extractTotalAndTax(lines: string[]): { totalAmount: number; taxAmount: number | null } {
  let bestTotal: number | null = null;
  let taxAmount: number | null = null;
  const allAmounts: number[] = [];

  for (const line of lines) {
    const amountMatches = line.match(/[-+]?\d[\d.,]{0,18}/g) ?? [];
    for (const token of amountMatches) {
      const amount = parseAmountToken(token);
      if (amount !== null) {
        allAmounts.push(Math.abs(amount));
      }
    }

    if (/vat|tax|iva|mwst|tva/i.test(line)) {
      for (const token of amountMatches) {
        const candidate = parseAmountToken(token);
        if (candidate !== null) {
          taxAmount = Math.abs(candidate);
        }
      }
    }

    if (/total|amount due|grand total|balance due|to pay/i.test(line)) {
      for (const token of amountMatches) {
        const candidate = parseAmountToken(token);
        if (candidate !== null) {
          const abs = Math.abs(candidate);
          if (bestTotal === null || abs > bestTotal) {
            bestTotal = abs;
          }
        }
      }
    }
  }

  if (bestTotal === null && allAmounts.length > 0) {
    bestTotal = Math.max(...allAmounts);
  }

  return {
    totalAmount: bestTotal ?? 0,
    taxAmount,
  };
}

function extractPaymentMethod(text: string): string | null {
  const lowerText = text.toLowerCase();
  if (/apple pay|google pay|gpay/.test(lowerText)) {
    return "digital_wallet";
  }
  if (/visa|mastercard|amex|debit|credit card|card/.test(lowerText)) {
    return "card";
  }
  if (/cash/.test(lowerText)) {
    return "cash";
  }
  if (/bank transfer|wire/.test(lowerText)) {
    return "bank_transfer";
  }
  return null;
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function buildConfidence(params: {
  ocrConfidence: number;
  totalAmount: number;
  currency: string;
  vendor: string;
  city: string;
  country: string;
  category: string;
  parsedDate: string;
}): FieldConfidence {
  const base = Math.max(0.35, Math.min(0.98, params.ocrConfidence / 100));
  const totalAmountConfidence = params.totalAmount > 0 ? base : 0.35;
  const currencyConfidence = params.currency ? base : 0.4;
  const vendorConfidence = params.vendor !== "Unknown Vendor" ? base : 0.45;
  const cityConfidence = params.city !== "Unknown City" ? base : 0.45;
  const countryConfidence = params.country !== "UN" ? base : 0.5;
  const categoryConfidence = params.category !== "other" ? Math.min(0.95, base + 0.08) : 0.55;
  const dateConfidence = params.parsedDate ? base : 0.45;

  return {
    totalAmount: totalAmountConfidence,
    currency: currencyConfidence,
    category: categoryConfidence,
    vendor: vendorConfidence,
    date: dateConfidence,
    city: cityConfidence,
    country: countryConfidence,
  };
}

/**
 * Parses raw OCR text into structured invoice fields with confidence hints for review.
 */
export function parseInvoiceText(params: {
  rawText: string;
  fallbackCurrency: string;
  ocrConfidence: number;
  cityOverride?: string;
  notes?: string;
}): ParsedInvoiceFields {
  const lines = params.rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const { totalAmount, taxAmount } = extractTotalAndTax(lines);
  const vendor = extractVendor(lines);
  const date = extractDate(lines);
  const currency = extractCurrency(params.rawText, params.fallbackCurrency);
  const { city, country } = extractCityAndCountry(params.rawText, params.cityOverride);
  const category = detectCategory(params.rawText, vendor);
  const paymentMethod = extractPaymentMethod(params.rawText);

  const confidence = buildConfidence({
    ocrConfidence: params.ocrConfidence,
    totalAmount,
    currency,
    vendor,
    city,
    country,
    category,
    parsedDate: date,
  });

  return {
    totalAmount,
    currency,
    category,
    vendor,
    date,
    city,
    country,
    taxAmount,
    paymentMethod,
    notes: params.notes ?? null,
    rawText: params.rawText,
    confidence,
  };
}
