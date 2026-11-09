import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Building2, HandCoins, ShieldCheck, Store, UserRound, Loader2 } from "lucide-react";
import { dashboardPath, useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { InfoNote } from "../components/ui";

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@trustflow.demo", password: "Admin123!" },
  { label: "Organisation", email: "org@reliefa.demo", password: "Demo1234!" },
  { label: "Donor", email: "donor@trustflow.demo", password: "Demo1234!" },
  { label: "Vendor", email: "vendor@aqua.demo", password: "Demo1234!" },
];

const ROLES = [
  { value: "donor", label: "Donor", icon: HandCoins, hint: "Fund verified projects and trace the impact." },
  { value: "organisation", label: "Organisation", icon: Building2, hint: "Create projects and request purpose-locked purchases." },
  { value: "vendor", label: "Vendor", icon: Store, hint: "Receive purchase orders and settlement." },
];

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("donor");
  const [organisationName, setOrganisationName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
  }, [mode]);

  if (user) return <Navigate to={dashboardPath(user.role)} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const current = await login(email.trim(), password);
        toast.push(`Welcome back, ${current.full_name.split(" ")[0]}.`, "success");
        navigate(dashboardPath(current.role), { replace: true });
      } else {
        const payload: Record<string, unknown> = {
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          role,
        };
        if (role === "organisation") {
          payload.organisation_name = organisationName.trim();
          payload.registration_number = registrationNumber.trim();
        }
        if (role === "vendor") {
          payload.business_name = businessName.trim();
          payload.registration_number = registrationNumber.trim();
        }
        const current = await register(payload);
        toast.push("Account created. Verification is pending administrator review.", "success");
        navigate(dashboardPath(current.role), { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to authenticate.");
    } finally {
      setBusy(false);
    }
  };

  const quickLogin = async (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setError(null);
    setBusy(true);
    try {
      const current = await login(account.email, account.password);
      toast.push(`Signed in as ${current.full_name}.`, "success");
      navigate(dashboardPath(current.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden overflow-hidden border-r border-white/[0.06] bg-navy-900/60 p-10 lg:flex lg:flex-col">
        <div className="hero-grid absolute inset-0 opacity-60" />
        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-navy-950 shadow-glow">
              <ShieldCheck className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">TrustFlow</span>
          </Link>
        </div>
        <div className="relative mt-auto max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Purpose-locked finance</p>
          <h1 className="mt-3 text-balance text-3xl font-semibold leading-tight tracking-tight text-white">
            Donations that cannot be spent outside their purpose.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Sign in to explore the working demo: a restricted ledger, verified vendor settlement and a deterministic
            authorization engine with a full audit trail.
          </p>
        </div>
        <div className="relative mt-10 rounded-2xl border border-white/[0.07] bg-navy-850/70 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">One-click demo access</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.label}
                onClick={() => quickLogin(account)}
                disabled={busy}
                className="flex items-center justify-between rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-left text-xs text-slate-300 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/[0.06] hover:text-white disabled:opacity-50"
              >
                <span>{account.label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            All accounts use seeded demo data. Payments are simulated — no real money moves.
          </p>
        </div>
        <p className="relative mt-8 text-[11px] uppercase tracking-[0.14em] text-slate-600">Prototype · Simulated settlement</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 text-navy-950">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-white">TrustFlow</span>
            </Link>
            <Link to="/" className="btn-ghost text-xs">
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
          </div>

          <div className="mb-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
              {mode === "login" ? "Secure access" : "Create an account"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {mode === "login" ? "Sign in to TrustFlow" : "Join the accountability network"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {mode === "login"
                ? "Use your demo credentials or one of the quick-access accounts."
                : "Donors can fund immediately. Organisations and vendors require administrator verification."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" ? (
              <>
                <div>
                  <span className="label">Account type</span>
                  <div className="grid grid-cols-3 gap-2">
                    {ROLES.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        onClick={() => setRole(option.value)}
                        className={`rounded-xl border px-2 py-3 text-center transition-colors ${
                          role === option.value
                            ? "border-emerald-400/40 bg-emerald-400/[0.08] text-emerald-200"
                            : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:text-slate-200"
                        }`}
                      >
                        <option.icon className="mx-auto mb-1.5 h-4 w-4" />
                        <span className="text-xs font-medium">{option.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">{ROLES.find((option) => option.value === role)?.hint}</p>
                </div>
                <div>
                  <label className="label" htmlFor="fullName">Full name</label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="fullName"
                      className="input pl-9"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Priya Sharma"
                      required
                      minLength={2}
                    />
                  </div>
                </div>
                {role === "organisation" ? (
                  <>
                    <div>
                      <label className="label" htmlFor="organisationName">Organisation name</label>
                      <input
                        id="organisationName"
                        className="input"
                        value={organisationName}
                        onChange={(event) => setOrganisationName(event.target.value)}
                        placeholder="Relief Organisation A"
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="orgReg">Registration number</label>
                      <input
                        id="orgReg"
                        className="input"
                        value={registrationNumber}
                        onChange={(event) => setRegistrationNumber(event.target.value)}
                        placeholder="REG-2026-001"
                        required
                      />
                    </div>
                  </>
                ) : null}
                {role === "vendor" ? (
                  <>
                    <div>
                      <label className="label" htmlFor="businessName">Business name</label>
                      <input
                        id="businessName"
                        className="input"
                        value={businessName}
                        onChange={(event) => setBusinessName(event.target.value)}
                        placeholder="AquaPure Supplies"
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="vendorReg">Registration number</label>
                      <input
                        id="vendorReg"
                        className="input"
                        value={registrationNumber}
                        onChange={(event) => setRegistrationNumber(event.target.value)}
                        placeholder="VEN-2026-4417"
                        required
                      />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            <div>
              <label className="label" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@organisation.org"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8}
                required
              />
            </div>

            {error ? (
              <div className="rounded-lg border border-red-400/25 bg-red-400/[0.07] px-3 py-2.5 text-xs leading-relaxed text-red-200">
                {error}
              </div>
            ) : null}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === "login" ? "Sign in" : "Create account"}
              {!busy ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-xs">
            {mode === "login" ? (
              <>
                <span className="text-slate-500">New to TrustFlow?</span>
                <Link to="/register" className="link">Create an account</Link>
              </>
            ) : (
              <>
                <span className="text-slate-500">Already registered?</span>
                <Link to="/login" className="link">Sign in</Link>
              </>
            )}
          </div>

          {mode === "login" ? (
            <div className="mt-6 grid grid-cols-2 gap-2 lg:hidden">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.label}
                  onClick={() => quickLogin(account)}
                  disabled={busy}
                  className="btn-secondary px-3 py-2 text-xs"
                >
                  {account.label} demo
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-8">
            <InfoNote tone="amber">
              This prototype simulates donations and vendor settlement. It does not hold real customer funds and is not
              a regulated wallet.
            </InfoNote>
          </div>
        </div>
      </main>
    </div>
  );
}
