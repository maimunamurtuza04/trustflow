import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeCheck, Building2, MapPin, Search, Users } from "lucide-react";
import { useApi } from "../lib/hooks";
import { compactMoney, money, shortDate } from "../lib/format";
import type { Project } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/Layout";
import { DonateModal } from "../components/DonateModal";
import { EmptyState, InfoNote, LoadingBlock, ProgressBar, StatusBadge } from "../components/ui";

export default function BrowseProjects() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi<Project[]>("/projects");
  const [query, setQuery] = useState("");
  const [donateTo, setDonateTo] = useState<Project | null>(null);

  const projects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data ?? [];
    return (data ?? []).filter(
      (project) =>
        project.name.toLowerCase().includes(needle) ||
        project.category.toLowerCase().includes(needle) ||
        project.organisation?.name.toLowerCase().includes(needle),
    );
  }, [data, query]);

  return (
    <>
      <PageHeader
        eyebrow="Verified causes"
        title="Browse purpose-restricted projects"
        description="Every project publishes its approved spending policy. Donations are locked to that purpose and paid only to verified vendors through authorised purchases."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Search by project, category or organisation"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p className="text-xs text-slate-500">{projects.length} active project{projects.length === 1 ? "" : "s"}</p>
      </div>

      {loading ? (
        <div className="panel p-6">
          <LoadingBlock lines={5} />
        </div>
      ) : error ? (
        <EmptyState title="Unable to load projects" description={error} />
      ) : projects.length === 0 ? (
        <EmptyState title="No projects found" description="Try a different search term." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const financials = project.financials;
            return (
              <article key={project.id} className="panel flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="chip">{project.category}</span>
                  <StatusBadge status={project.status} />
                </div>
                <Link to={`/projects/${project.id}`} className="mt-3">
                  <h2 className="text-[15px] font-semibold leading-snug text-white hover:text-emerald-200">
                    {project.name}
                  </h2>
                </Link>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-400">{project.description}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> {project.organisation?.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> {project.target_beneficiaries.toLocaleString("en-IN")} beneficiaries
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {project.geographic_coverage}
                  </span>
                </div>
                <div className="mt-4">
                  <div className="mb-2 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Raised</p>
                      <p className="font-mono text-sm text-white">
                        {money(financials.received_minor, project.currency)}
                        <span className="text-slate-500"> / {compactMoney(financials.funding_target_minor, project.currency)}</span>
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-500">{financials.progress_percent}%</span>
                  </div>
                  <ProgressBar value={financials.progress_percent} tone="emerald" />
                  <p className="mt-2 text-[11px] text-slate-500">
                    {money(financials.available_minor, project.currency)} still restricted and unspent
                  </p>
                </div>
                <div className="mt-5 flex items-center gap-2 border-t border-white/[0.06] pt-4">
                  <Link to={`/projects/${project.id}`} className="btn-secondary flex-1 px-3 py-2 text-xs">
                    View project <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  {user?.role === "donor" ? (
                    <button className="btn-primary flex-1 px-3 py-2 text-xs" onClick={() => setDonateTo(project)}>
                      Donate
                    </button>
                  ) : null}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-600">
                  <BadgeCheck className="h-3 w-3 text-emerald-400" />
                  Policy v{project.policy?.version ?? "—"} approved · ends {shortDate(project.ends_on)}
                </p>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <InfoNote>
          Project verification means the organisation and its approved spending policy were reviewed. It does not
          guarantee delivery of physical goods; delivery evidence is tracked separately.
        </InfoNote>
      </div>

      <DonateModal
        project={donateTo}
        open={Boolean(donateTo)}
        onClose={() => setDonateTo(null)}
        onComplete={reload}
      />
    </>
  );
}
