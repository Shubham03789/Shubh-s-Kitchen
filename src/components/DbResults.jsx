function detail(result) {
  if (result.state === "ok") return "Saved";
  if (result.state === "error") return result.error || "Failed";
  const missing = Array.isArray(result.missingEnv) ? result.missingEnv.join(", ") : "";
  return missing ? `Not configured (missing ${missing})` : "Not configured";
}

export default function DbResults({ title, results, note, error, onClose }) {
  const list = Array.isArray(results) ? results : [];
  const saved = list.filter((result) => result.state === "ok").length;

  return (
    <section aria-live="polite">
      <h2>{title}</h2>
      <p>
        {saved} of {list.length} saved
      </p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {list.map((result) => (
          <li key={result.id}>
            {result.label || result.id}: {detail(result)}
          </li>
        ))}
      </ul>
      {note && <p>{note}</p>}
      {onClose && (
        <button type="button" onClick={onClose}>
          Close
        </button>
      )}
      <hr />
    </section>
  );
}
