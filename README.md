# Cloud Invoice Scanner (Vercel + Next.js)

Web version of the invoice scanner: users upload invoice images, OCR runs automatically, fields are extracted/categorised, and files are organised in a city/date folder structure.

## What it does
- Upload one or more invoice/receipt images from browser.
- OCR extraction with `tesseract.js`.
- Structured fields returned:
  - `totalAmount`, `currency`, `category`, `vendor`, `date`, `city`, `country`, `taxAmount`, `paymentMethod`, `notes`, `rawText`
- Auto category detection via keyword + vendor hint engine.
- Folder organisation:
  - `InvoiceScanner/{City}/{YYYY-MM-DD}/invoice_<id>.<ext>`
  - `InvoiceScanner/{City}/{YYYY-MM-DD}/invoice_<id>.json`
- Browse grouped by `City -> Date`.
- Delete invoice + files.
- CSV export with filters.

## Storage mode
- **Production (recommended):** Vercel Blob (`BLOB_READ_WRITE_TOKEN` configured).
- **Local fallback:** writes to `./data/InvoiceScanner/...` and serves images via `/api/files`.

## Tech stack
- Next.js (App Router, TypeScript)
- Vercel Blob (`@vercel/blob`)
- OCR: `tesseract.js`
- Date parsing: `date-fns`

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Optional (for cloud persistence): copy `.env.example` to `.env.local` and set:
   ```bash
   BLOB_READ_WRITE_TOKEN=...
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`.

## Deploy to Vercel
1. Push this folder to a Git repo.
2. Import project in Vercel.
3. Add environment variable:
   - `BLOB_READ_WRITE_TOKEN`
4. Deploy.

## API endpoints
- `POST /api/process`:
  - form-data: `file`, optional `fallbackCurrency`, `cityOverride`, `notes`
- `GET /api/invoices`:
  - optional query: `city`, `category`, `dateFrom`, `dateTo`
- `DELETE /api/invoices?id=<invoiceId>`
- `GET /api/export/csv`
- `GET /api/files?path=InvoiceScanner/...` (local storage mode only)

## Notes
- OCR quality depends on image quality and lighting.
- This implementation auto-fills city from text if detected; otherwise `Unknown City` is used unless `cityOverride` is provided.
- On Vercel, persistent storage should use Blob; local filesystem is not persistent in serverless runtime.

