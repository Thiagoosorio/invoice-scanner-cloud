import { CATEGORY_KEYWORDS, CATEGORY_ORDER, VENDOR_HINTS } from "./constants";
import type { ExpenseCategory } from "./types";

/**
 * Scores category keywords against OCR text and vendor hints to auto-assign an expense category.
 */
export function detectCategory(rawText: string, vendor: string): ExpenseCategory {
  const normalisedText = rawText.toLowerCase();
  const normalisedVendor = vendor.toLowerCase();

  for (const [merchantHint, category] of Object.entries(VENDOR_HINTS)) {
    if (normalisedVendor.includes(merchantHint) || normalisedText.includes(merchantHint)) {
      return category;
    }
  }

  let bestCategory: ExpenseCategory = "other";
  let bestScore = 0;

  for (const category of CATEGORY_ORDER) {
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords.length === 0) {
      continue;
    }

    const score = keywords.reduce((acc, keyword) => {
      if (normalisedText.includes(keyword)) {
        return acc + 1;
      }
      return acc;
    }, 0);

    if (score > bestScore) {
      bestCategory = category;
      bestScore = score;
    }
  }

  return bestCategory;
}

