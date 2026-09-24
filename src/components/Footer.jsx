import { STORE_NAME } from "../config.js";
import { sourceLabel } from "../lib/format.js";

const STATE_TEXT = { ok: "OK", error: "Error", not_configured: "Not configured" };

export default function Footer({ health, healthError, onRefresh, writeTo }) {
  const databases = health && Array.isArray(health.databases) ? health.databases : [];

  return (
    <footer>
      <hr />
      <h2>Database health</h2>
      {!health && !healthError && <p>Checking the databases…</p>}
      {healthError && <p role="alert">API not reachable: {healthError}</p>}
      {databases.length > 0 && (
        <ul>
          {databases.map((db) => (
            <li key={db.id} title={db.error || (db.missingEnv ? `Missing ${db.missingEnv.join(", ")}` : "")}>
              {db.label || db.id}
              {health.primary === db.id && " (primary)"}: {STATE_TEXT[db.state] || db.state}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onRefresh}>
        Refresh
      </button>
      <p>
        {writeTo
          ? `Logins and orders are being saved only to ${sourceLabel(writeTo)}`
          : "Every login and order is written to all configured databases"}
        {health && health.primary ? `; reads default to ${sourceLabel(health.primary)}.` : "."}
      </p>
      <p>
        <small>
          © {new Date().getFullYear()} {STORE_NAME}
        </small>
      </p>
    </footer>
  );
}
