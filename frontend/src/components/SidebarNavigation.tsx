import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getPortalCapabilities } from "../auth/portalAccess";
import type { PortalAccessShape } from "../auth/portalAccess";
import "./SidebarNavigation.css";

type IconName = "quality" | "people" | "models" | "roles" | "audit" | "home";
type Item = { label: string; to: string; filter?: string };
type Module = {
  id: IconName;
  label: string;
  items: Item[];
  query?: string;
};

function ModuleIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    quality: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6",
    people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-3.87",
    models: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M8 21v-2a4 4 0 0 1 8 0v2 M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
    roles: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
    audit: "M8 3H5a2 2 0 0 0-2 2v15a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V5a2 2 0 0 0-2-2h-3 M8 2h8v4H8V2Z M7 11h10 M7 16h6",
    home: "M3 3h7v7H3V3Z M14 3h7v7h-7V3Z M3 14h7v7H3v-7Z M14 14h7v7h-7v-7Z",
  };
  return (
    <svg className="hub-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

function Chevron({ className = "" }: { className?: string }) {
  return <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}

function NavigationModule({ module }: { module: Module }) {
  const { pathname, search } = useLocation();
  const active = module.items.some((item) => item.to.split("?")[0] === pathname);
  const [expanded, setExpanded] = useState(active);
  const rawFilter = module.query ? new URLSearchParams(search).get(module.query) : null;
  const filter = module.items.some((item) => item.filter === rawFilter) ? rawFilter : "ALL";

  return (
    <div className={`hub-nav-module${active ? " is-current" : ""}`}>
      <button type="button" className="hub-nav-toggle" aria-expanded={expanded} aria-controls={`nav-${module.id}`} onClick={() => setExpanded(!expanded)}>
        <ModuleIcon name={module.id} />
        <span>{module.label}</span>
        <Chevron className="hub-nav-chevron" />
      </button>
      <ul id={`nav-${module.id}`} className="hub-nav-children" hidden={!expanded}>
        {module.items.map((item) => {
          const selected = pathname === item.to.split("?")[0] && (!module.query || filter === item.filter);
          return (
            <li key={item.to}>
              <Link to={item.to} className={`hub-nav-child${selected ? " active" : ""}`} aria-current={selected ? "page" : undefined}>
                <span>{item.label}</span>
                {selected && <Chevron className="hub-nav-child-arrow" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SidebarNavigation({ access }: { access: PortalAccessShape | null }) {
  const caps = getPortalCapabilities(access);
  const location = useLocation();
  const qa: Module = {
    id: "quality", label: "Quality & Incident Tracking",
    items: [
      { label: "Overview", to: "/" },
      { label: "Incidents", to: "/incidents" },
      { label: "Chatters", to: "/chatters" },
      ...(caps.canConfigureQa ? [{ label: "Rules & Strike Reasons", to: "/rules" }, { label: "Configuration", to: "/configuration" }] : []),
    ],
  };
  const management: Module[] = [];
  if (caps.canManagePeople) management.push({
    id: "people", label: "People", query: "status",
    items: [
      { label: "All people", to: "/people", filter: "ALL" },
      { label: "Active", to: "/people?status=ACTIVE", filter: "ACTIVE" },
      { label: "Pending setup", to: "/people?status=PENDING_SETUP", filter: "PENDING_SETUP" },
      { label: "Deactivated", to: "/people?status=DEACTIVATED", filter: "DEACTIVATED" },
    ],
  });
  if (caps.canManageModels) management.push({
    id: "models", label: "Models", query: "status",
    items: [
      { label: "All models", to: "/models", filter: "ALL" },
      { label: "Active models", to: "/models?status=ACTIVE", filter: "ACTIVE" },
      { label: "Inactive models", to: "/models?status=INACTIVE", filter: "INACTIVE" },
    ],
  });
  const system: Module[] = [];
  if (caps.canManageRoles) system.push({
    id: "roles", label: "Role Builder", query: "type",
    items: [
      { label: "All roles", to: "/roles", filter: "ALL" },
      { label: "System roles", to: "/roles?type=SYSTEM", filter: "SYSTEM" },
      { label: "Custom roles", to: "/roles?type=CUSTOM", filter: "CUSTOM" },
    ],
  });
  if (caps.canViewAudit) system.push({
    id: "audit", label: "Audit Log", query: "result",
    items: [
      { label: "All events", to: "/audit", filter: "ALL" },
      { label: "Successful events", to: "/audit?result=SUCCESS", filter: "SUCCESS" },
      { label: "Failed events", to: "/audit?result=FAILED", filter: "FAILED" },
    ],
  });

  // Remount disclosures on navigation so direct links and Back/Forward always
  // reveal the current page. Toggling a module never navigates or changes data.
  const renderModule = (module: Module) => <NavigationModule key={`${module.id}-${location.key}`} module={module} />;
  return (
    <nav className="hub-navigation" aria-label="Main navigation">
      <div className="hub-nav-section">
        <p className="hub-nav-heading">Workspace</p>
        {caps.canViewQa ? renderModule(qa) : <Link to="/" className={`hub-nav-toggle${location.pathname === "/" ? " active" : ""}`} aria-current={location.pathname === "/" ? "page" : undefined}><ModuleIcon name="home" /><span>Overview</span></Link>}
      </div>
      {management.length > 0 && <div className="hub-nav-section"><p className="hub-nav-heading">Management</p>{management.map(renderModule)}</div>}
      {system.length > 0 && <div className="hub-nav-section"><p className="hub-nav-heading">System</p>{system.map(renderModule)}</div>}
    </nav>
  );
}
