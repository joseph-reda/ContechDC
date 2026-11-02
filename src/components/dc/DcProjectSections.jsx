import { disciplineLabel, groupDcSections } from "../../utils/dcSections";

const typeNames = {
  IR: "Inspection Requests · IR",
  CPR: "Concrete Pouring Requests · CPR",
  TR: "Test Reports · TR",
  REVISION: "Revisions",
  SD: "Shop Drawings",
};

export default function DcProjectSections({
  items,
  columns,
  renderRow,
  onCopyAll,
  copyingGroup = "",
  onArchiveProjectRequests,
  archivingScope = "",
  loading = false,
}) {
  return <div className="dc-project-cards">
    {groupDcSections(items).map(({ project, sections }) => <section key={project} className="dc-project-card" aria-label={`Project ${project || "Unassigned"}`}>
      <header className="dc-project-card-header"><div><span>Project</span><h3>{project || "Unassigned"}</h3></div><strong>{sections.reduce((sum, section) => sum + section.items.length, 0)} displayed</strong></header>
      <div className="dc-project-card-body">
        {sections.map(({ type, items: sectionItems, disciplines }) => {
          const copyKey = JSON.stringify([project, type, ""]);
          return <section key={type} className={`dc-type-subsection dc-type-subsection-${type.toLowerCase()}`} aria-label={`${typeNames[type] || type} in ${project || "Unassigned"}`}>
            <div className="dc-type-subsection-header"><div><h4>{typeNames[type] || type}</h4><span>{sectionItems.length} displayed in this section</span></div>
              <div className="dc-type-subsection-actions">
                {onCopyAll && ["IR", "CPR", "TR"].includes(type) && <button type="button" disabled={loading || Boolean(copyingGroup) || Boolean(archivingScope)} onClick={() => onCopyAll(project, type)} aria-label={`Copy all ${type} records in ${project || "Unassigned"}`}>{copyingGroup === copyKey ? "Copying..." : `Copy All ${type} — ${project || "Unassigned"}`}</button>}
                {onArchiveProjectRequests && project && ["IR", "CPR", "TR"].includes(type) && <button type="button" className="dc-archive-action" disabled={loading || Boolean(archivingScope) || Boolean(copyingGroup)} onClick={() => onArchiveProjectRequests(project, type)} aria-label={`Archive all ${type} records for Project ${project}`}>{archivingScope === copyKey ? "Archiving..." : `Archive All ${type} — ${project}`}</button>}
              </div>
            </div>
            {disciplines.map(({ discipline, items: disciplineItems }) => {
              const disciplineCopyKey = JSON.stringify([project, type, discipline]);
              const label = disciplineLabel(discipline);
              return <section key={discipline || "unassigned"} className="dc-discipline-section" aria-label={`${label} ${type} records in ${project}`}>
                <div className="dc-discipline-header"><div><h5>{label}</h5><span>{disciplineItems.length} {disciplineItems.length === 1 ? "record" : "records"}</span></div>
                  <div className="dc-discipline-actions">
                    {onCopyAll && ["IR", "CPR", "TR"].includes(type) && <button type="button" disabled={loading || Boolean(copyingGroup) || Boolean(archivingScope)} onClick={() => onCopyAll(project, type, discipline)}>{copyingGroup === disciplineCopyKey ? "Copying…" : `Copy All ${type} — ${label} — ${project}`}</button>}
                    {onArchiveProjectRequests && project && discipline && ["IR", "CPR", "TR"].includes(type) && <button type="button" className="dc-archive-action" disabled={loading || Boolean(copyingGroup) || Boolean(archivingScope)} onClick={() => onArchiveProjectRequests(project, type, discipline)}>{archivingScope === disciplineCopyKey ? "Archiving…" : `Archive All ${type} — ${label} — ${project}`}</button>}
                  </div>
                </div>
                <div className="dc-table-scroll"><table className="w-full min-w-[1180px] text-left text-sm"><thead><tr>{columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr></thead><tbody>{disciplineItems.map(renderRow)}</tbody></table></div>
              </section>;
            })}
          </section>;
        })}
      </div>
    </section>)}
  </div>;
}
