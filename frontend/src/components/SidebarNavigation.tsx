import {
  Link,
  useLocation,
} from "react-router-dom";

import {
  getPortalCapabilities,
} from "../auth/portalAccess";

import type {
  PortalAccessShape,
} from "../auth/portalAccess";

import "./SidebarNavigation.css";

type IconName =
  | "dashboard"
  | "quality"
  | "strikes"
  | "people"
  | "models"
  | "roles"
  | "audit";

type NavigationItem = {
  id: IconName;
  label: string;
  to: string;
  activePaths?: string[];
};

const QA_CORE_ITEMS: Array<{
  label: string;
  to: string;
}> = [
  {
    label: "Overview",
    to: "/quality",
  },
  {
    label: "Incidents",
    to: "/incidents",
  },
  {
    label: "Chatters",
    to: "/chatters",
  },
];

const QA_CONFIGURATION_ITEMS: Array<{
  label: string;
  to: string;
}> = [
  {
    label: "Rules",
    to: "/rules",
  },
];

const QA_PATHS = new Set([
  ...[
    ...QA_CORE_ITEMS,
    ...QA_CONFIGURATION_ITEMS,
  ].map(
    (item) => item.to
  ),

  "/rules/settings",
]);

function ModuleIcon({
  name,
}: {
  name: IconName;
}) {
  const paths: Record<
    IconName,
    string
  > = {
    dashboard:
      "M4 4h6v6H4V4Z M14 4h6v4h-6V4Z M14 12h6v8h-6v-8Z M4 14h6v6H4v-6Z",
    quality:
      "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z M8 12l3 3 5-6",
    strikes:
      "M12 3 20 7v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z M12 8v5 M12 17h.01",
    people:
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-3.87",
    models:
      "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M8 21v-2a4 4 0 0 1 8 0v2 M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
    roles:
      "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
    audit:
      "M6 3h9l3 3v15H6V3Z M14 3v4h4 M9 11h6 M9 15h6",
  };

  return (
    <svg
      className="hub-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={paths[name]}
      />
    </svg>
  );
}

function NavigationLink({
  item,
}: {
  item: NavigationItem;
}) {
  const {
    pathname,
  } = useLocation();

  const paths =
    item.activePaths ??
    [item.to];

  const active =
    paths.includes(
      pathname
    ) ||
    (
      item.to ===
        "/people" &&
      pathname.startsWith(
        "/people/"
      )
    );

  return (
    <Link
      to={item.to}
      className={`hub-nav-link${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <ModuleIcon
        name={item.id}
      />
      <span>
        {item.label}
      </span>
    </Link>
  );
}

function QualityNavigation({
  canConfigureQa,
}: {
  canConfigureQa: boolean;
}) {
  const {
    pathname,
  } = useLocation();

  const active =
    QA_PATHS.has(
      pathname
    ) ||
    pathname.startsWith(
      "/chatters/"
    );

  const visibleItems =
    canConfigureQa
      ? [
          ...QA_CORE_ITEMS,
          ...QA_CONFIGURATION_ITEMS,
        ]
      : QA_CORE_ITEMS;

  return (
    <details
      className={`hub-nav-group${active ? " active" : ""}`}
      open={active ? true : undefined}
    >
      <summary className="hub-nav-group-summary">
        <ModuleIcon
          name="quality"
        />
        <span>
          Quality & Incidents
        </span>
        <svg
          className="hub-nav-group-chevron"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </summary>

      <div className="hub-nav-group-links">
        {visibleItems.map(
          (item) => {
            const childActive =
              pathname ===
                item.to ||
              (
                item.to ===
                  "/rules" &&
                pathname ===
                  "/rules/settings"
              ) ||
              (
                item.to ===
                  "/chatters" &&
                pathname.startsWith(
                  "/chatters/"
                )
              );

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`hub-nav-child-link${childActive ? " active" : ""}`}
                aria-current={childActive ? "page" : undefined}
              >
                <span className="hub-nav-child-dot" />
                <span>
                  {item.label}
                </span>
              </Link>
            );
          }
        )}
      </div>
    </details>
  );
}

export default function SidebarNavigation({
  access,
}: {
  access:
    PortalAccessShape |
    null;
}) {
  const capabilities =
    getPortalCapabilities(
      access
    );

  const primary: NavigationItem[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      to: "/",
    },
  ];

  if (
    capabilities.canManagePeople
  ) {
    primary.push({
      id: "people",
      label: "People",
      to: "/people",
    });
  }

  if (
    capabilities.canManageModels
  ) {
    primary.push({
      id: "models",
      label: "Creators",
      to: "/models",
    });
  }

  const administration: NavigationItem[] = [];

  if (
    capabilities.canManageRoles
  ) {
    administration.push({
      id: "roles",
      label: "Role Settings",
      to: "/roles",
    });
  }

  if (
    capabilities.canViewAudit
  ) {
    administration.push({
      id: "audit",
      label: "Audit Log",
      to: "/audit",
    });
  }

  return (
    <nav
      className="hub-navigation"
      aria-label="Main navigation"
    >
      <div className="hub-nav-section">
        <p className="hub-nav-heading">
          Agency
        </p>

        <NavigationLink
          item={primary[0]}
        />

        {capabilities.canViewQa && (
          <QualityNavigation
            canConfigureQa={capabilities.canConfigureQa}
          />
        )}

        {capabilities.canViewStrikes && (
          <NavigationLink
            item={{
              id: "strikes",
              label: "Strikes",
              to: "/strikes",
              activePaths: [
                "/strikes",
                "/strikes/settings",
              ],
            }}
          />
        )}

        {primary.slice(1).map(
          (item) => (
            <NavigationLink
              key={item.id}
              item={item}
            />
          )
        )}
      </div>

      {administration.length > 0 && (
        <div className="hub-nav-section">
          <p className="hub-nav-heading">
            Administration
          </p>

          {administration.map(
            (item) => (
              <NavigationLink
                key={item.id}
                item={item}
              />
            )
          )}
        </div>
      )}
    </nav>
  );
}
