"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./page.module.css";
import type { ExpenseCategory, InvoiceRecord } from "@/lib/types";

const CATEGORY_OPTIONS: Array<{ value: ExpenseCategory | ""; label: string }> = [
  { value: "", label: "All categories" },
  { value: "transport", label: "Transport" },
  { value: "food", label: "Food" },
  { value: "accommodation", label: "Accommodation" },
  { value: "fuel", label: "Fuel" },
  { value: "parking", label: "Parking" },
  { value: "telecom", label: "Telecom" },
  { value: "office_supplies", label: "Office Supplies" },
  { value: "entertainment", label: "Entertainment" },
  { value: "other", label: "Other" },
];

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function lowConfidenceFields(invoice: InvoiceRecord): string[] {
  return Object.entries(invoice.confidence)
    .filter(([, confidence]) => confidence < 0.6)
    .map(([field]) => field);
}

function toQueryString(params: Record<string, string>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }
  return searchParams.toString();
}

export default function Home() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fallbackCurrency, setFallbackCurrency] = useState("USD");
  const [cityOverride, setCityOverride] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | "">("");
  const [cityFilter, setCityFilter] = useState("");
  const [dateFromFilter, setDateFromFilter] = useState("");
  const [dateToFilter, setDateToFilter] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("Ready");
  const [errorText, setErrorText] = useState("");

  const loadInvoices = useCallback(async () => {
    setIsLoading(true);
    setErrorText("");
    try {
      const query = toQueryString({
        category: categoryFilter,
        city: cityFilter,
        dateFrom: dateFromFilter,
        dateTo: dateToFilter,
      });
      const response = await fetch(`/api/invoices${query ? `?${query}` : ""}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load invoices (${response.status})`);
      }
      const payload = (await response.json()) as { invoices: InvoiceRecord[] };
      setInvoices(payload.invoices);
      setStatusText(`Loaded ${payload.invoices.length} invoices`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Unknown load error");
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, cityFilter, dateFromFilter, dateToFilter]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  const summary = useMemo(() => {
    const totalSpend = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const categoryCounts = invoices.reduce<Record<string, number>>((acc, invoice) => {
      acc[invoice.category] = (acc[invoice.category] ?? 0) + 1;
      return acc;
    }, {});
    const topCategory = Object.entries(categoryCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "-";
    return {
      totalSpend,
      invoiceCount: invoices.length,
      topCategory,
    };
  }, [invoices]);

  const groupedInvoices = useMemo(() => {
    const grouped: Record<string, Record<string, InvoiceRecord[]>> = {};
    for (const invoice of invoices) {
      if (!grouped[invoice.city]) {
        grouped[invoice.city] = {};
      }
      if (!grouped[invoice.city][invoice.date]) {
        grouped[invoice.city][invoice.date] = [];
      }
      grouped[invoice.city][invoice.date].push(invoice);
    }
    return grouped;
  }, [invoices]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFiles.length === 0) {
      setErrorText("Select at least one image file.");
      return;
    }

    setErrorText("");
    setIsLoading(true);
    let processedCount = 0;

    try {
      for (const file of selectedFiles) {
        setStatusText(`Processing ${file.name} (${processedCount + 1}/${selectedFiles.length})...`);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fallbackCurrency", fallbackCurrency.toUpperCase());
        if (cityOverride.trim()) {
          formData.append("cityOverride", cityOverride.trim());
        }
        if (notes.trim()) {
          formData.append("notes", notes.trim());
        }

        const response = await fetch("/api/process", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? `Failed to process ${file.name}`);
        }

        processedCount += 1;
      }

      setStatusText(`Processed ${processedCount} file(s)`);
      setSelectedFiles([]);
      setNotes("");
      await loadInvoices();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Unknown upload error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(invoiceId: string) {
    if (!window.confirm("Delete this invoice and its files?")) {
      return;
    }
    setIsLoading(true);
    setErrorText("");
    try {
      const response = await fetch(`/api/invoices?id=${encodeURIComponent(invoiceId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Delete failed (${response.status})`);
      }
      await loadInvoices();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Unknown delete error");
      setIsLoading(false);
    }
  }

  const exportQuery = toQueryString({
    category: categoryFilter,
    city: cityFilter,
    dateFrom: dateFromFilter,
    dateTo: dateToFilter,
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Cloud Invoice Scanner</h1>
          <p>Upload receipt photos, auto-extract data, and organise by City - Date folders in cloud storage.</p>
        </div>
        <div className={styles.headerActions}>
          <button onClick={() => void loadInvoices()} disabled={isLoading}>
            Refresh
          </button>
          <a href={`/api/export/csv${exportQuery ? `?${exportQuery}` : ""}`}>Export CSV</a>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <h2>Total spend</h2>
          <p>{formatMoney(summary.totalSpend, fallbackCurrency.toUpperCase())}</p>
        </article>
        <article className={styles.summaryCard}>
          <h2>Invoices</h2>
          <p>{summary.invoiceCount}</p>
        </article>
        <article className={styles.summaryCard}>
          <h2>Top category</h2>
          <p>{summary.topCategory}</p>
        </article>
      </section>

      <section className={styles.panel}>
        <h2>Upload and process</h2>
        <form onSubmit={handleUpload} className={styles.formGrid}>
          <label>
            Images
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          <label>
            Default currency
            <input
              value={fallbackCurrency}
              onChange={(event) => setFallbackCurrency(event.target.value.toUpperCase())}
              maxLength={3}
            />
          </label>
          <label>
            City override (optional)
            <input value={cityOverride} onChange={(event) => setCityOverride(event.target.value)} />
          </label>
          <label className={styles.fullWidth}>
            Notes (optional)
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </label>
          <button type="submit" disabled={isLoading || selectedFiles.length === 0}>
            {isLoading ? "Processing..." : `Process ${selectedFiles.length || ""} file(s)`}
          </button>
        </form>
      </section>

      <section className={styles.panel}>
        <h2>Filters</h2>
        <div className={styles.filters}>
          <label>
            City
            <input value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} />
          </label>
          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as ExpenseCategory | "")}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date from
            <input type="date" value={dateFromFilter} onChange={(event) => setDateFromFilter(event.target.value)} />
          </label>
          <label>
            Date to
            <input type="date" value={dateToFilter} onChange={(event) => setDateToFilter(event.target.value)} />
          </label>
          <button onClick={() => void loadInvoices()} disabled={isLoading}>
            Apply
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>Browse (City - Date - Invoices)</h2>
        <p className={styles.status}>{statusText}</p>
        {errorText ? <p className={styles.error}>{errorText}</p> : null}

        {Object.keys(groupedInvoices).length === 0 ? (
          <p className={styles.empty}>No invoices found for current filters.</p>
        ) : null}

        {Object.entries(groupedInvoices).map(([city, dateMap]) => (
          <div key={city} className={styles.cityBlock}>
            <h3>{city}</h3>
            {Object.entries(dateMap)
              .sort((left, right) => right[0].localeCompare(left[0]))
              .map(([date, dateInvoices]) => (
                <div key={`${city}-${date}`} className={styles.dateBlock}>
                  <h4>{date}</h4>
                  <div className={styles.invoiceGrid}>
                    {dateInvoices.map((invoice) => {
                      const cautionFields = lowConfidenceFields(invoice);
                      return (
                        <article key={invoice.id} className={styles.invoiceCard}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={invoice.imageUrl} alt={`${invoice.vendor} invoice`} />
                          <div>
                            <strong>{invoice.vendor}</strong>
                            <p>{formatMoney(invoice.totalAmount, invoice.currency)}</p>
                            <p>
                              {invoice.category} - {invoice.country}
                            </p>
                            <p>Payment: {invoice.paymentMethod ?? "unknown"}</p>
                            {cautionFields.length > 0 ? (
                              <p className={styles.warning}>Verify: {cautionFields.join(", ")}</p>
                            ) : null}
                          </div>
                          <button onClick={() => void handleDelete(invoice.id)}>Delete</button>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </section>
    </div>
  );
}
