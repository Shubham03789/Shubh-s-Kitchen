import { CURRENCY, LOCALE } from "../config.js";

export const DATABASES = [
  { id: "firebase", label: "Firebase Firestore" },
  { id: "cockroachdb", label: "CockroachDB" },
  { id: "mysql", label: "MySQL (Aiven)" },
];

export function sourceLabel(id) {
  if (id === "catalog") return "the built-in catalog";
  const db = DATABASES.find((item) => item.id === id);
  return db ? db.label : String(id || "unknown");
}

export function fallbackNote(wanted, source, state) {
  const why = state === "not_configured" ? "is not set up" : "did not answer";
  return `${sourceLabel(wanted)} ${why}, so this is showing ${sourceLabel(source)} instead.`;
}

export function formatPrice(amount) {
  const value = Number(amount || 0) / 100;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function shortId(id) {
  return String(id || "").slice(0, 8).toUpperCase();
}
