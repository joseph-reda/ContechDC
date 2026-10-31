import { groupDcSections } from "../../utils/dcSections";

const typeNames = {
  IR: "Inspection Requests · IR",
  CPR: "Concrete Pouring Requests · CPR",
  TR: "Test Reports · TR",
  REVISION: "Revisions",
  SD: "Shop Drawings",
};

export default function DcProjectSections({ items, columns, renderRow, onCopyAll, copyingGroup = "", loading = false }) {
  return <div className="dc-project-cards">
    {groupDcSections(items).map(({ project, sections }) => <section key={project} className="dc-project-card" aria-label={`Project ${project || "Unassigned"}`}>
      <header className="dc-project-card-header"><div><span>Project</span><h3>{project || "Unassigned"}</h3></div><strong>{sections.reduce((sum, section) => sum + section.items.length, 0)} displayed</strong></header>
      <div className="dc-project-card-body">
        {sections.map(({ type, items: sectionItems }) => {
          const copyKey = JSON.stringify([project, type]);
          return <section key={type} className={`dc-type-subsection dc-type-subsection-${type.toLowerCase()}`} aria-label={`${typeNames[type] || type} in ${project || "Unassigned"}`}>
            <div className="dc-type-subsection-header"><div><h4>{typeNames[type] || type}</h4><span>{sectionItems.length} displayed in this section</span></div>
              {onCopyAll && ["IR", "CPR", "TR"].includes(type) && <button type="button" disabled={loading || Boolean(copyingGroup)} onClick={() => onCopyAll(project, type, sectionItems)} aria-label={`Copy all displayed ${type} records in ${project || "Unassigned"}`}>{copyingGroup === copyKey ? "Copying..." : "Copy All"}</button>}
            </div>
            <div className="dc-table-scroll"><table className="w-full min-w-[1180px] text-left text-sm"><thead><tr>{columns.map((column) => <th key={column} className="px-4 py-3">{column}</th>)}</tr></thead><tbody>{sectionItems.map(renderRow)}</tbody></table></div>
          </section>;
        })}
      </div>
    </section>)}
  </div>;
}
