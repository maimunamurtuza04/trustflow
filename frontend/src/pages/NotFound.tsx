import { Link } from "react-router-dom";
import { ArrowLeft, Compass, ShieldCheck } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5 py-14">
      <div className="w-full max-w-lg text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-navy-950 shadow-glow">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-slate-500">Error 404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">This record does not exist</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
          The page may have moved, or your role does not have access to this financial record. Access to purchase
          requests is scoped server-side by role and organisation.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Link to="/app" className="btn-primary">
            <Compass className="h-4 w-4" />
            Go to dashboard
          </Link>
          <Link to="/" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
