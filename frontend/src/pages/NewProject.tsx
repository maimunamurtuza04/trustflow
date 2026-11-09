import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Plus,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { Project, RequirementsResponse } from "../lib/types";
import { useToast } from "../context/ToastContext";
import { PageHeader } from "../components/Layout";
import { InfoNote, SectionHeading } from "../components/ui";

const PROJECT_CATEGORIES = [
  "Flood relief",
  "Disaster response",
  "Orphanage support",
  "Education",
  "Medical assistance",
  "Food distribution",
  "Rural development",
];

const CATEGORY_PRESETS = [
  "Drinking water",
  "Food supplies",
  "Medical supplies",
  "Shelter materials",
  "Blankets",
  "Hygiene kits",
  "Rescue equipment",
  "Transportation",
  "Communications equipment",
  "Education materials",
];

export default function NewProject() {
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState("");
  const [category, setCategory] = useState(PROJECT_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [beneficiaries, setBeneficiaries] = useState("300");
  const [geography, setGeography] = useState("");
  const [target, setTarget] = useState("10000");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [operational, setOperational] = useState("");
  const [limit, setLimit] = useState("5000");
  const [categories, setCategories] = useState<string[]>(["Drinking water", "Food supplies"]);
  const [budgets, setBudgets] = useState<Record<string, string>>({ "Drinking water": "3000", "Food supplies": "4000" });
  const [customCategory, setCustomCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<RequirementsResponse | null>(null);

  const fundingTargetMinor = Math.round(Number(target || "0") * 100);
  const budgetSumMinor = useMemo(
    () => categories.reduce((sum, item) => sum + Math.round(Number(budgets[item] || "0") * 100), 0),
    [categories, budgets],
  );

  const toggleCategory = (value: string) => {
    setCategories((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        setBudgets((rows) => {
          const copy = { ...rows };
          delete copy[value];
          return copy;
        });
        return next;
      }
      setBudgets((rows) => ({ ...rows, [value]: rows[value] ?? "" }));
      return [...current, value];
    });
  };

  const addCustomCategory = () => {
    const value = customCategory.trim();
    if (!value) return;
    if (categories.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setCustomCategory("");
      return;
    }
    setCategories((current) => [...current, value]);
    setBudgets((current) => ({ ...current, [value]: "" }));
    setCustomCategory("");
  };

  const analyseNeeds = async () => {
    setError(null);
    if (description.trim().length < 20) {
      setError("Describe the project in at least 20 characters before running AI analysis.");
      return;
    }
    setAiBusy(true);
    try {
      const result = await api.post<RequirementsResponse>("/ai/project-requirements", {
        description: description.trim(),
        project_category: category,
        target_beneficiaries: Number(beneficiaries) || null,
        budget_minor: fundingTargetMinor || null,
      });
      setAiResult(result);
      if (!result.available) {
        toast.push("AI is not configured. No suggestions were generated — you can continue manually.", "info");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI analysis request failed.");
    } finally {
      setAiBusy(false);
    }
  };

  const applySuggestions = () => {
    const suggestions = aiResult?.output.requirements ?? [];
    if (!suggestions.length) return;
    const nextCategories = [...categories];
    const nextBudgets = { ...budgets };
    for (const suggestion of suggestions) {
      const label = (suggestion.category ?? "").trim();
      if (!label) continue;
      if (!nextCategories.some((item) => item.toLowerCase() === label.toLowerCase())) {
        nextCategories.push(label);
      }
      const value = suggestion.estimated_budget_minor;
      if (typeof value === "number" && value > 0 && !nextBudgets[label]) {
        nextBudgets[label] = String(Math.round(value / 100));
      }
    }
    setCategories(nextCategories);
    setBudgets(nextBudgets);
    toast.push("AI-suggested categories added. Review and edit every budget before submitting.", "info");
  };

  const submit = async () => {
    setError(null);
    if (!name.trim() || description.trim().length < 20 || !geography.trim()) {
      setError("Provide a name, a description of at least 20 characters and a geographic coverage area.");
      return;
    }
    if (categories.length === 0) {
      setError("Select at least one approved spending category.");
      return;
    }
    const budgetLines = categories.map((item) => ({
      category: item,
      allocated_minor: Math.round(Number(budgets[item] || "0") * 100),
    }));
    if (budgetLines.some((line) => line.allocated_minor <= 0)) {
      setError("Every approved category needs a positive budget amount.");
      return;
    }
    if (fundingTargetMinor <= 0 || Math.round(Number(limit || "0") * 100) <= 0) {
      setError("Funding target and per-transaction limit must be greater than zero.");
      return;
    }
    if (budgetSumMinor > fundingTargetMinor) {
      setError("Category budgets cannot exceed the funding target.");
      return;
    }
    setBusy(true);
    try {
      const project = await api.post<Project>("/projects", {
        name: name.trim(),
        description: description.trim(),
        category,
        target_beneficiaries: Number(beneficiaries),
        geographic_coverage: geography.trim(),
        funding_target_minor: fundingTargetMinor,
        currency: "INR",
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        operational_requirements: operational.trim() || null,
        approved_categories: categories,
        per_transaction_limit_minor: Math.round(Number(limit) * 100),
        budgets: budgetLines,
      });
      toast.push("Project and policy draft submitted. An administrator must approve the policy before purchases.", "success");
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create the project.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title="Create a purpose-restricted project"
        description="Define the project, its approved spending categories and its budget. A draft policy is submitted for administrator approval — no spending is possible until it is approved."
        actions={
          <Link to="/app/org" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back to overview
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-5">
          <section className="panel p-5 sm:p-6">
            <SectionHeading eyebrow="Project" title="Description" />
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="project-name">Project name</label>
                <input id="project-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Flood Relief 2026" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="project-category">Project category</label>
                  <select id="project-category" className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
                    {PROJECT_CATEGORIES.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="beneficiaries">Target beneficiaries</label>
                  <input
                    id="beneficiaries"
                    className="input font-mono"
                    inputMode="numeric"
                    value={beneficiaries}
                    onChange={(event) => setBeneficiaries(event.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="description">Project description</label>
                <textarea
                  id="description"
                  className="input min-h-[120px] resize-y"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Provide emergency assistance to 300 people affected by flooding, including drinking water, food, medical support and temporary shelter."
                />
                <p className="mt-1.5 text-[11px] text-slate-500">{description.length} characters · minimum 20</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="geography">Geographic coverage</label>
                  <input id="geography" className="input" value={geography} onChange={(event) => setGeography(event.target.value)} placeholder="Ernakulam district, Kerala" />
                </div>
                <div>
                  <label className="label" htmlFor="target">Funding target (INR)</label>
                  <input
                    id="target"
                    className="input font-mono"
                    inputMode="decimal"
                    value={target}
                    onChange={(event) => setTarget(event.target.value.replace(/[^0-9.]/g, ""))}
                  />
                  <p className="mt-1.5 text-[11px] text-slate-500">{money(fundingTargetMinor)}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="starts">Starts on</label>
                  <input id="starts" type="date" className="input" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="ends">Ends on</label>
                  <input id="ends" type="date" className="input" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="operational">Operational requirements</label>
                <textarea
                  id="operational"
                  className="input min-h-[80px] resize-y"
                  value={operational}
                  onChange={(event) => setOperational(event.target.value)}
                  placeholder="Transport, field communications, warehouse handling and volunteer coordination requirements."
                />
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <SectionHeading
              eyebrow="Spending policy"
              title="Approved categories & budget"
              description="Only these categories can be authorised. Every purchase outside this list is blocked deterministically, regardless of AI opinion."
            />
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_PRESETS.map((preset) => {
                const selected = categories.includes(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => toggleCategory(preset)}
                    className={`chip transition-colors ${
                      selected ? "!border-emerald-400/40 !bg-emerald-400/10 !text-emerald-200" : "hover:!border-white/20"
                    }`}
                  >
                    {selected ? <CheckCircle2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    {preset}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="input"
                value={customCategory}
                onChange={(event) => setCustomCategory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomCategory();
                  }
                }}
                placeholder="Add a custom approved category"
              />
              <button type="button" className="btn-secondary shrink-0" onClick={addCustomCategory}>
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>

            {categories.length > 0 ? (
              <div className="mt-5 space-y-3">
                {categories.map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-200">{item}</p>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Approved category</p>
                    </div>
                    <div className="w-36">
                      <input
                        className="input font-mono"
                        inputMode="decimal"
                        value={budgets[item] ?? ""}
                        onChange={(event) =>
                          setBudgets((current) => ({ ...current, [item]: event.target.value.replace(/[^0-9.]/g, "") }))
                        }
                        placeholder="Budget"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-ghost rounded-lg p-2"
                      onClick={() => toggleCategory(item)}
                      aria-label={`Remove ${item}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
                  <span className="text-slate-500">Total allocated</span>
                  <span className={`font-mono ${budgetSumMinor > fundingTargetMinor ? "text-red-300" : "text-slate-200"}`}>
                    {money(budgetSumMinor)} / {money(fundingTargetMinor)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">Select at least one category to define its budget.</p>
            )}

            <div className="mt-5">
              <label className="label" htmlFor="limit">Per-transaction limit (INR)</label>
              <input
                id="limit"
                className="input font-mono"
                inputMode="decimal"
                value={limit}
                onChange={(event) => setLimit(event.target.value.replace(/[^0-9.]/g, ""))}
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                Any single purchase above this amount fails the deterministic engine and cannot be authorised.
              </p>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-white">
                  <BrainCircuit className="h-4 w-4 text-emerald-400" />
                  AI needs analysis
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Advisory only. Suggestions never become a spending policy or an authorisation.
                </p>
              </div>
              <Sparkles className="h-4 w-4 shrink-0 text-slate-600" />
            </div>
            <button className="btn-secondary mt-4 w-full" onClick={analyseNeeds} disabled={aiBusy}>
              {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              Analyse project needs
            </button>

            {aiResult ? (
              <div className="mt-4">
                {aiResult.available ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                        Suggested by {aiResult.model ?? "AI model"}
                      </p>
                      {aiResult.output.summary ? (
                        <p className="mt-1.5 text-xs leading-relaxed text-emerald-100/80">{aiResult.output.summary}</p>
                      ) : null}
                    </div>
                    <ul className="space-y-2">
                      {(aiResult.output.requirements ?? []).map((requirement, index) => (
                        <li key={`${requirement.category}-${index}`} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-slate-200">{requirement.category}</p>
                            {typeof requirement.confidence === "number" ? (
                              <span className="text-[10px] text-slate-500">{Math.round(requirement.confidence * 100)}%</span>
                            ) : null}
                          </div>
                          {requirement.estimated_budget_minor ? (
                            <p className="mt-1 font-mono text-[11px] text-slate-400">
                              est. {money(requirement.estimated_budget_minor)}
                              {requirement.estimated_quantity ? ` · ${requirement.estimated_quantity}` : ""}
                            </p>
                          ) : null}
                          {requirement.reasoning ? (
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{requirement.reasoning}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <button className="btn-secondary w-full px-3 py-2 text-xs" onClick={applySuggestions}>
                      Add suggested categories & budgets
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
                      <TriangleAlert className="h-3.5 w-3.5" /> AI unavailable
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-amber-100/80">{aiResult.detail}</p>
                  </div>
                )}
                <p className="mt-3 text-[10px] leading-relaxed text-slate-600">{aiResult.disclaimer}</p>
              </div>
            ) : (
              <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                With no AI provider configured, this panel reports that AI is unavailable. It never invents
                recommendations.
              </p>
            )}
          </section>

          <div className="panel p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-white">
              <LockKeyhole className="h-4 w-4 text-emerald-400" />
              What happens next
            </p>
            <ol className="mt-3 space-y-3 text-xs leading-relaxed text-slate-400">
              <li>1. Project is created in <span className="text-slate-200">pending approval</span> with a draft policy.</li>
              <li>2. An administrator reviews and approves the policy version.</li>
              <li>3. The project becomes active and can receive donations.</li>
              <li>4. Purchases are evaluated against the approved categories, budgets and limits.</li>
            </ol>
          </div>

          <InfoNote>
            Draft policies cannot authorise spending. Approval mirrors the budget into reporting rows and is recorded in
            the append-only audit log.
          </InfoNote>
        </aside>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-400/25 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link to="/app/org" className="btn-secondary">Cancel</Link>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
          Submit project & policy draft
        </button>
      </div>
    </>
  );
}
