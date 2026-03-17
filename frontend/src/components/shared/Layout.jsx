/**
 * Shared Layout Components
 * Owner: Frontend Dev 1
 *
 * Reusable layout primitives used by all dashboard modules.
 * Design tokens and component styles live in index.css — never add
 * raw Tailwind color/border/bg utilities here for anything brand-related.
 *
 * ─── Component Index ─────────────────────────────────────────────────────────
 *
 *  <RoleGuardedRoute>     — Wraps any page that requires auth + specific roles.
 *                           Use in App.jsx around every dashboard route.
 *
 *  <AppSidebar>           — Left-hand navigation column. Role-aware nav links.
 *                           Rendered once inside <PageWithSidebar>.
 *
 *  <PageWithSidebar>      — Full-page shell: sidebar + scrollable content area.
 *                           Wrap each dashboard page's root element with this.
 *
 *  <SectionCard>          — White content card with optional title, subtitle,
 *                           and header action buttons. Use for every content
 *                           section on a dashboard page (tables, forms, etc.).
 *
 *  <CampaignStatusBadge>  — Pill badge showing an advertisement's lifecycle
 *                           state (draft → published). Drop into any table row
 *                           or detail view that shows ad status.
 *
 *  <MetricSummaryCard>    — Single-metric KPI tile (label + big number + trend).
 *                           Arrange 3–4 of these in a grid at the top of any
 *                           analytics or dashboard page.
 */

import React from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  LayoutDashboard, Users, FileText, BarChart3,
  LogOut, Shield, Eye, Megaphone, Globe, Bot,
} from "lucide-react";

// ─── RoleGuardedRoute ─────────────────────────────────────────────────────────
// Usage: wrap a page component in App.jsx to restrict access by role.
//
//   <RoleGuardedRoute allowedRoles={["admin"]}>
//     <AdminDashboard />
//   </RoleGuardedRoute>

export function RoleGuardedRoute({ children, allowedRoles }) {
  const { isAuthenticated, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="spinner--dark" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} />;
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" />;
  }
  return children;
}

// Keep legacy alias so existing imports don't break while you migrate.
export const ProtectedRoute = RoleGuardedRoute;

// ─── Navigation map (role → sidebar links) ───────────────────────────────────
// Add / remove links here when extending a role's feature set.

const SIDEBAR_LINKS_BY_ROLE = {
  admin: [
    { label: "Dashboard",       icon: LayoutDashboard, path: "/admin" },
    { label: "Create Campaign", icon: Megaphone,        path: "/admin/create" },
    { label: "User Management", icon: Users,            path: "/admin/users" },
    { label: "My Company",      icon: FileText,         path: "/admin/company" },
    { label: "Analytics",       icon: BarChart3,        path: "/admin/analytics" },
  ],
  reviewer: [
    { label: "Dashboard",    icon: LayoutDashboard, path: "/reviewer" },
    { label: "Review Queue", icon: Eye,             path: "/reviewer/queue" },
    { label: "Analytics",    icon: BarChart3,       path: "/reviewer/analytics" },
  ],
  ethics_reviewer: [
    { label: "Dashboard",     icon: LayoutDashboard, path: "/ethics" },
    { label: "Ethics Review", icon: Shield,          path: "/ethics/review" },
    { label: "Documents",     icon: FileText,        path: "/ethics/documents" },
  ],
  publisher: [
    { label: "Dashboard",       icon: LayoutDashboard, path: "/publisher" },
    { label: "Ad Creator",      icon: Megaphone,       path: "/publisher/ads" },
    { label: "Website Creator", icon: Globe,           path: "/publisher/website" },
    { label: "Bot Config",      icon: Bot,             path: "/publisher/bots" },
    { label: "Analytics",       icon: BarChart3,       path: "/publisher/analytics" },
  ],
};

// ─── AppSidebar ───────────────────────────────────────────────────────────────
// Already included inside <PageWithSidebar> — no need to add manually.

export function AppSidebar() {
  const { role, logout } = useAuth();
  const location = useLocation();
  const navLinks = SIDEBAR_LINKS_BY_ROLE[role] || [];

  return (
    <aside className="sidebar">
      {/* Brand / logo strip */}
      <div className="sidebar__brand">
        <div className="flex items-center gap-2.5">
          <div className="sidebar__logo-mark">
            <div className="w-2.5 h-2.5 bg-gray-950 rounded-sm" />
          </div>
          <span className="sidebar__app-name">AgenticMarketing</span>
        </div>
        <p className="sidebar__role-label">{role?.replace("_", " ")}</p>
      </div>

      {/* Role-specific nav links */}
      <nav className="sidebar__nav">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={isActive ? "sidebar__nav-link--active" : "sidebar__nav-link"}
            >
              <Icon size={16} />
              {link.label}
              {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-current opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Sign-out */}
      <button onClick={logout} className="sidebar__signout">
        <LogOut size={15} />
        Sign Out
      </button>
    </aside>
  );
}

// Keep legacy alias.
export const Sidebar = AppSidebar;

// ─── PageWithSidebar ──────────────────────────────────────────────────────────
// Usage: wrap the JSX returned by every dashboard page component.
//
//   export default function AdminDashboard() {
//     return (
//       <PageWithSidebar>
//         <h1 className="page-header__title">Hello</h1>
//         <SectionCard title="Campaigns"> ... </SectionCard>
//       </PageWithSidebar>
//     );
//   }

export function PageWithSidebar({ children }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-page-bg)" }}>
      <AppSidebar />
      <main className="flex-1 p-8 overflow-auto min-w-0">{children}</main>
    </div>
  );
}

// Keep legacy alias.
export const DashboardLayout = PageWithSidebar;

// ─── SectionCard ─────────────────────────────────────────────────────────────
// Usage: wrap any logical content block on a dashboard page.
//
//   <SectionCard
//     title="Active Campaigns"
//     subtitle="Campaigns currently under review"
//     actions={<button className="btn--accent">+ New</button>}
//   >
//     <CampaignsTable />
//   </SectionCard>

export function SectionCard({ title, subtitle, children, actions, className = "" }) {
  return (
    <div className={`page-card ${className}`}>
      {(title || actions) && (
        <div className="page-card__header">
          <div>
            {title    && <h3 className="page-card__title">{title}</h3>}
            {subtitle && <p className="page-card__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      )}
      <div className="page-card__body">{children}</div>
    </div>
  );
}

// Keep legacy alias.
export const Card = SectionCard;

// ─── CampaignStatusBadge ──────────────────────────────────────────────────────
// Usage: pass the advertisement's `status` field from the API response.
//
//   <CampaignStatusBadge status={ad.status} />
//
// Valid status values (matches Advertisement.status in models.py):
//   draft | strategy_created | under_review | ethics_review |
//   approved | published | paused | optimizing

const STATUS_TO_CSS_MODIFIER = {
  draft:            "status-badge--draft",
  strategy_created: "status-badge--draft",
  under_review:     "status-badge--review",
  ethics_review:    "status-badge--review",
  approved:         "status-badge--approved",
  published:        "status-badge--published",
  paused:           "status-badge--paused",
  optimizing:       "status-badge--draft",
};

export function CampaignStatusBadge({ status }) {
  const modifier = STATUS_TO_CSS_MODIFIER[status] || "status-badge--draft";
  return (
    <span className={`status-badge ${modifier}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

// Keep legacy alias.
export const StatusBadge = CampaignStatusBadge;

// ─── MetricSummaryCard ────────────────────────────────────────────────────────
// Usage: arrange 3–4 in a responsive grid at the top of analytics pages.
//
//   <div className="grid grid-cols-4 gap-4">
//     <MetricSummaryCard label="Total Campaigns" value={42} icon={Megaphone} trend={12} />
//     <MetricSummaryCard label="Click-Through Rate" value="3.8%" icon={BarChart3} trend={-2} />
//   </div>

export function MetricSummaryCard({ label, value, icon: Icon, trend }) {
  return (
    <div className="metric-tile">
      <div className="flex items-center justify-between mb-3">
        <p className="metric-tile__label">{label}</p>
        {Icon && (
          <div className="metric-tile__icon-wrap">
            <Icon size={15} style={{ color: "var(--color-sidebar-text)" }} />
          </div>
        )}
      </div>
      <p className="metric-tile__value">{value}</p>
      {trend != null && (
        <p className={trend > 0 ? "metric-tile__trend--up" : "metric-tile__trend--down"}>
          {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last period
        </p>
      )}
    </div>
  );
}

// Keep legacy alias.
export const StatCard = MetricSummaryCard;