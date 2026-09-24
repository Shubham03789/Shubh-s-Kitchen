import { DATABASES } from "../lib/format.js";

const STATE_SUFFIX = { error: "(not answering)", not_configured: "(not set up)" };

export default function DbPicker({ value, onChange, saveTo, onSaveToChange, health }) {
  const databases = health && Array.isArray(health.databases) ? health.databases : [];
  const stateOf = (id) => {
    const db = databases.find((item) => item.id === id);
    return db ? db.state : "";
  };
  const picked = DATABASES.find((db) => db.id === value);

  return (
    <div>
      <fieldset>
        <legend>Database</legend>
        {DATABASES.map((db) => {
          const suffix = STATE_SUFFIX[stateOf(db.id)];
          return (
            <label key={db.id}>
              <input
                type="radio"
                name="db-read"
                value={db.id}
                checked={value === db.id}
                onChange={() => onChange(db.id)}
              />
              {db.label}
              {suffix && ` ${suffix}`}
            </label>
          );
        })}
      </fieldset>

      <fieldset>
        <legend>Save to</legend>
        <label>
          <input type="radio" name="db-write" value="all" checked={saveTo === "all"} onChange={() => onSaveToChange("all")} />
          All databases
        </label>
        <label>
          <input
            type="radio"
            name="db-write"
            value="one"
            checked={saveTo === "one"}
            disabled={!picked}
            onChange={() => onSaveToChange("one")}
          />
          Only {picked ? picked.label : "the picked database"}
        </label>
      </fieldset>
    </div>
  );
}
