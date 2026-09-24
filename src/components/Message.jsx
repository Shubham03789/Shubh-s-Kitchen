const TAGS = { info: "Note", success: "Done", error: "Error" };

export default function Message({ message, onClose }) {
  const text = message && message.text;
  const type = (message && message.type) || "info";
  return (
    <div role="status" aria-live="polite" hidden={!text}>
      {text && (
        <p>
          <strong>{TAGS[type] || "Note"}:</strong> {text}{" "}
          {onClose && (
            <button type="button" onClick={onClose}>
              Dismiss
            </button>
          )}
        </p>
      )}
    </div>
  );
}
