import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { dashboardPath, useAuth } from "./context/AuthContext";
import { AppShell } from "./components/Layout";
import type { Role } from "./lib/types";
import Landing from "./pages/Landing";
import AuthPage from "./pages/AuthPage";
import DonorDashboard from "./pages/DonorDashboard";
import OrgDashboard from "./pages/OrgDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import VendorDashboard from "./pages/VendorDashboard";
import BrowseProjects from "./pages/BrowseProjects";
import ProjectDetail from "./pages/ProjectDetail";
import NewProject from "./pages/NewProject";
import NewPurchase from "./pages/NewPurchase";
import PurchaseDetail from "./pages/PurchaseDetail";
import AuditLog from "./pages/AuditLog";
import NotFound from "./pages/NotFound";

function FullScreenLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-emerald-400 text-navy-950">
        <ShieldCheck className="h-6 w-6" />
      </span>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Securing session</p>
    </div>
  );
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function RoleGuard({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={dashboardPath(user.role)} replace />;
  return <Outlet />;
}

function RoleRedirect() {
  const { user } = useAuth();
  return <Navigate to={dashboardPath(user?.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route element={<Protected />}>
        <Route path="/app" element={<RoleRedirect />} />
        <Route path="/app/donor" element={<DonorDashboard />} />
        <Route path="/app/org" element={<OrgDashboard />} />
        <Route path="/app/admin" element={<AdminDashboard />} />
        <Route path="/app/vendor" element={<VendorDashboard />} />
        <Route path="/projects" element={<BrowseProjects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/purchases/:id" element={<PurchaseDetail />} />
        <Route path="/audit" element={<RoleGuard roles={["admin"]} />}>
          <Route index element={<AuditLog />} />
        </Route>
        <Route element={<RoleGuard roles={["organisation"]} />}>
          <Route path="/projects/new" element={<NewProject />} />
          <Route path="/projects/:id/purchase/new" element={<NewPurchase />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
