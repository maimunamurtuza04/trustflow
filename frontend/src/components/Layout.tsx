import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Compass,
  FolderPlus,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  ShieldCheck,
  X,
} from "lucide-react";
import { dashboardPath, useAuth } from "../context/AuthContext";
import { initials } from "../lib/format";

const NAV = {
  donor: [
    { to: "/app/donor", label: "My giving", icon: LayoutDashboard },
    { to: "/projects", label: "Browse projects", icon: Compass },
  ],
  organisation: [
    { to: "/app/org", label: "Overview", icon: LayoutDashboard },
    { to: "/projects/new", label: "New project", icon: FolderPlus },
  ],
  vendor: [
    { to: "/app/vendor", label: "Overview", icon: LayoutDashboard },
    { to: "/projects", label: "Browse projects", icon: Compass },
  ],
  admin: [
    { to: "/app/admin", label: "Overview", icon: LayoutDashboard },
    { to: "/audit", label: "Audit history", icon: ScrollText },
  ],
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = user ? NAV[user.role] ?? [] : [];

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const nav = (
    <nav className="mt-8 flex flex-1 flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-emerald-400/10 text-emerald-200"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
            }`
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col px-4 py-5">
      <div className="flex items-center justify-between">
        <NavLink to="/" className="flex items-center gap-2.5 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-navy-950 shadow-glow">
            <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span>
            <span className="block text-[15px] font-semibold tracking-tight text-white">TrustFlow</span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-slate-500">Purpose-locked funds</span>
          </span>
        </NavLink>
        <button className="btn-ghost p-2 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X className="h-4 w-4" />
        </button>
      </div>
      {nav}
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Simulated settlement
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-100/60">
          No real money moves. Restricted balances and vendor payments are simulated for this prototype.
        </p>
      </div>
      {user ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-slate-200">
              {initials(user.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
              <p className="truncate text-[11px] capitalize text-slate-500">
                {user.role === "organisation" ? "Organisation" : user.role}
              </p>
            </div>
            <button onClick={handleLogout} className="btn-ghost rounded-lg p-2" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[0.06] bg-navy-900/80 backdrop-blur lg:block">
        {sidebarContent}
      </aside>

      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.06] bg-navy-950/85 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="btn-ghost p-2" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <NavLink to={dashboardPath(user?.role)} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400 text-navy-950">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold text-white">TrustFlow</span>
        </NavLink>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
          Sim
        </span>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 cursor-default bg-navy-950/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />
          <aside className="relative z-10 h-full w-[280px] border-r border-white/[0.08] bg-navy-900 animate-fade-in">
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">{eyebrow}</p>
        ) : null}
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
        {description ? <div className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
