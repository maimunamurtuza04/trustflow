import { useEffect, useState, type ReactNode } from "react";
import { Compass } from "lucide-react";
import { GettingStarted } from "./OnboardingTour";

export interface PageSection {
  id: string;
  label: string;
  hint: string;
}

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join("|");

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-18% 0px -62% 0px", threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}

export function PageOverview({
  intro,
  nextAction,
  sections,
  checklist,
}: {
  intro: ReactNode;
  nextAction?: ReactNode;
  sections: PageSection[];
  checklist?: { label: string; done: boolean }[];
}) {
  return (
    <section className="panel mb-5 overflow-hidden" data-tour="page-overview">
      <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
        <div className="p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Page overview</p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">{intro}</p>
          {nextAction ? (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                <Compass className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Next action</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{nextAction}</p>
              </div>
            </div>
          ) : null}
          {checklist ? <GettingStarted items={checklist} /> : null}
        </div>
        <div className="border-t border-white/[0.06] p-5 sm:p-6 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">On this page</p>
          <ol className="mt-3 space-y-2.5">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="group flex gap-3">
                  <span className="mt-0.5 font-mono text-[10px] text-slate-600">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-slate-200 group-hover:text-emerald-200">
                      {section.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{section.hint}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export function SectionNav({ sections }: { sections: PageSection[] }) {
  const active = useActiveSection(sections.map((section) => section.id));

  return (
    <div
      data-tour="section-nav"
      className="sticky top-[57px] z-20 -mx-4 mb-6 border-y border-white/[0.06] bg-navy-950/90 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10"
    >
      <nav aria-label="Page sections" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={active === section.id ? "true" : undefined}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              active === section.id
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                : "border-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
            }`}
          >
            {section.label}
          </a>
        ))}
      </nav>
    </div>
  );
}

export function PageSection({
  id,
  children,
  className = "",
  tour,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  tour?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-28 ${className}`} data-tour={tour}>
      {children}
    </section>
  );
}
