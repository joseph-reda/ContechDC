import { documentReferences } from "../../utils/documentDisplay";

export default function DocumentReferences({ item }) {
  const { irAttach, refSD, refMethod } = documentReferences(item);
  return (
    <dl className="dc-ref-details">
      <div><dt>IR Attach</dt><dd>{irAttach.length ? irAttach.join(" · ") : "—"}</dd></div>
      <div><dt>Ref SD</dt><dd>{refSD.length ? refSD.join(" · ") : "—"}</dd></div>
      <div><dt>Ref Method</dt><dd>{refMethod || "—"}</dd></div>
    </dl>
  );
}
