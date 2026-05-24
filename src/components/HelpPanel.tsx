import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { HELP_SECTIONS } from "../helpContent";

export function HelpPanel() {
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState(HELP_SECTIONS[0]?.id ?? "");

  const filteredSections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return HELP_SECTIONS;
    return HELP_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${section.title} ${section.summary} ${item.term} ${item.detail}`.toLowerCase().includes(needle),
        ),
      }))
      .filter((section) => section.items.length > 0 || section.title.toLowerCase().includes(needle));
  }, [query]);

  const visibleSection =
    filteredSections.find((section) => section.id === activeSection) ??
    filteredSections[0] ??
    HELP_SECTIONS[0];

  return (
    <div className="help-content">
      <section className="help-layout">
        <aside className="help-nav card">
          <div className="card-header">
            <BookOpen size={14} className="icon" />
            <h3>Help Files</h3>
          </div>
          <div className="help-search">
            <Search size={13} />
            <input
              className="form-input hf-input"
              value={query}
              placeholder="Search help"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="help-nav-list">
            {filteredSections.map((section) => (
              <button
                key={section.id}
                className={`help-nav-item ${visibleSection?.id === section.id ? "selected" : ""}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span>{section.title}</span>
                <small>{section.items.length} topics</small>
              </button>
            ))}
          </div>
        </aside>

        <article className="help-article card">
          {visibleSection ? (
            <>
              <div className="help-hero">
                <span className="help-icon"><BookOpen size={18} /></span>
                <div>
                  <h2>{visibleSection.title}</h2>
                  <p>{visibleSection.summary}</p>
                </div>
              </div>
              <div className="help-topic-list">
                {visibleSection.items.map((item) => (
                  <section key={`${visibleSection.id}-${item.term}`} className="help-topic">
                    <h4>{item.term}</h4>
                    <p>{item.detail}</p>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <span className="text-muted">No help topics match your search.</span>
          )}
        </article>
      </section>
    </div>
  );
}
