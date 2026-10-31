import { useId, useState } from "react";

const MAX_REFERENCES = 20;
const MAX_REFERENCE_LENGTH = 250;

function normalizeReferences(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean))]
    .slice(0, MAX_REFERENCES);
}

/**
 * The single form control for drawing / SD references across Engineer Mode.
 * `refDrawings` is deliberately an array so one inspection can cite multiple
 * issued drawings without creating parallel fields with the same meaning.
 */
export default function ReferenceDrawingsInput({ value = [], onChange, disabled = false }) {
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const [draft, setDraft] = useState("");
  const references = normalizeReferences(value);

  const addReference = () => {
    const next = draft.trim().slice(0, MAX_REFERENCE_LENGTH);
    if (!next || references.includes(next) || references.length >= MAX_REFERENCES) return;
    onChange([...references, next]);
    setDraft("");
  };

  const removeReference = (reference) => onChange(references.filter((item) => item !== reference));

  return (
    <section className="reference-drawings-field" aria-labelledby={`${inputId}-label`}>
      <div className="reference-drawings-heading">
        <div>
          <label id={`${inputId}-label`} htmlFor={inputId} className="reference-drawings-label">Ref Drawings / SD Attach</label>
          <p id={helpId} className="reference-drawings-help">Add each drawing reference once. Word export adds the current project and discipline to <code>refSD</code>.</p>
        </div>
        <span className="reference-drawings-count" aria-label={`${references.length} drawing references`}>{references.length}/{MAX_REFERENCES}</span>
      </div>
      <div className="reference-drawings-entry">
        <input
          id={inputId}
          type="text"
          value={draft}
          disabled={disabled || references.length >= MAX_REFERENCES}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_REFERENCE_LENGTH))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addReference();
            }
          }}
          className="reference-drawings-input"
          placeholder="e.g. SD-ARCH-017 or A-201 Rev. 3"
          aria-describedby={helpId}
        />
        <button type="button" onClick={addReference} disabled={disabled || !draft.trim() || references.length >= MAX_REFERENCES} className="reference-drawings-add">Add reference</button>
      </div>
      <div className="reference-drawings-list" aria-live="polite">
        {references.length === 0 ? <span className="reference-drawings-empty">No drawing references added.</span> : references.map((reference) => (
          <span className="reference-drawings-chip" key={reference}>
            <span>{reference}</span>
            <button type="button" onClick={() => removeReference(reference)} disabled={disabled} aria-label={`Remove ${reference}`}>×</button>
          </span>
        ))}
      </div>
    </section>
  );
}
