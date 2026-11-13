import {
  Link,
  useLocation,
} from "react-router-dom";
import { useClockReviewCount } from "./ClockReviewCountContext";

import {
  getPortalCapabilities,
  hasPortalPermission,
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
  | "chat"
  | "clock"
  | "audit";


type NavigationItem = {
  id:
    IconName;

  label:
    string;

  to:
    string;

  activePaths?:
    string[];

  actionCount?:
    number;
};


type ChildNavigationItem = {
  label:
    string;

  to:
    string;

  permission:
    string;
};


const QA_ITEMS:
  ChildNavigationItem[] = [
  {
    label:
      "Incidents",

    to:
      "/incidents",

    permission:
      "quality.incidents.view",
  },

  {
    label:
      "Chatters",

    to:
      "/chatters",

    permission:
      "quality.chatters.view",
  },

  {
    label:
      "Rules",

    to:
      "/rules",

    permission:
      "quality.rules.view",
  },
];


const STRIKE_ITEMS:
  ChildNavigationItem[] = [
  {
    label:
      "Strikes",

    to:
      "/strikes",

    permission:
      "strikes.view",
  },

  {
    label:
      "Reasons",

    to:
      "/strikes/reasons",

    permission:
      "strikes.reasons.view",
  },
];


function ModuleIcon({
  name,
}: {
  name:
    IconName;
}) {
  const paths:
    Record<
      IconName,
      string
    > = {
    chat: "M4 4h16v12H9l-5 4V4Z M8 8h8 M8 12h5",
    clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
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
        d={
          paths[
            name
          ]
        }
      />
    </svg>
  );
}


function NavigationLink({
  item,
}: {
  item:
    NavigationItem;
}) {
  const {
    pathname,
  } =
    useLocation();

  const paths =
    item.activePaths ??
    [
      item.to,
    ];

  const active =
    paths.includes(
      pathname
    ) ||
    (
      (item.to === "/people" || item.to === "/clock") &&
      pathname.startsWith(item.to + "/")
    );

  const link = (
    <Link
      to={
        item.to
      }
      className={
        "hub-nav-link" +
        (
          active
            ? " active"
            : ""
        )
      }
      aria-current={
        active
          ? "page"
          : undefined
      }
    >
      <ModuleIcon
        name={
          item.id
        }
      />

      <span>
        {
          item.label
        }
      </span>
    </Link>
  );

  if (item.id !== "clock" || !item.actionCount) return link;
  return <div className="hub-nav-notifiable">
    {link}
    <Link to="/clock?tab=review" className="hub-nav-action-count"
      title={`${item.actionCount} correction ${item.actionCount === 1 ? "request" : "requests"} need your review`}
      aria-label={`Open ${item.actionCount} pending correction ${item.actionCount === 1 ? "request" : "requests"}`}>
      {item.actionCount > 99 ? "99+" : item.actionCount}
    </Link>
  </div>;
}


function ModuleNavigation({
  id,
  label,
  items,
  access,
  settings,
}: {
  id:
    IconName;

  label:
    string;

  items:
    ChildNavigationItem[];

  access:
    PortalAccessShape |
    null;

  settings?:
    {
      to:
        string;

      permission:
        string;

      label:
        string;
    };
}) {
  const {
    pathname,
  } =
    useLocation();

  const visibleItems =
    items.filter(
      (
        item
      ) =>
        hasPortalPermission(
          access,
          item.permission
        )
    );

  const settingsVisible =
    Boolean(
      settings &&
      hasPortalPermission(
        access,
        settings.permission
      )
    );

  if (
    visibleItems.length ===
      0 &&
    !settingsVisible
  ) {
    return null;
  }

  const active =
    visibleItems.some(
      (
        item
      ) =>
        pathname ===
          item.to ||
        (
          item.to ===
            "/chatters" &&
          pathname.startsWith(
            "/chatters/"
          )
        )
    ) ||
    (
      settingsVisible &&
      settings &&
      pathname ===
        settings.to
    );

  return (
    <div className="hub-nav-group-shell">
      <details
        className={
          "hub-nav-group" +
          (
            active
              ? " active"
              : ""
          )
        }
        open={
          active
            ? true
            : undefined
        }
      >
        <summary className="hub-nav-group-summary">
          <ModuleIcon
            name={
              id
            }
          />

          <span>
            {
              label
            }
          </span>

          <svg
            className="hub-nav-group-chevron"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </summary>

        {visibleItems.length >
          0 && (
          <div className="hub-nav-group-links">
            {visibleItems.map(
              (
                item
              ) => {
                const childActive =
                  pathname ===
                    item.to ||
                  (
                    item.to ===
                      "/chatters" &&
                    pathname.startsWith(
                      "/chatters/"
                    )
                  );

                return (
                  <Link
                    key={
                      item.to
                    }
                    to={
                      item.to
                    }
                    className={
                      "hub-nav-child-link" +
                      (
                        childActive
                          ? " active"
                          : ""
                      )
                    }
                    aria-current={
                      childActive
                        ? "page"
                        : undefined
                    }
                  >
                    <span className="hub-nav-child-dot" />

                    <span>
                      {
                        item.label
                      }
                    </span>
                  </Link>
                );
              }
            )}
          </div>
        )}
      </details>

      {settingsVisible &&
        settings && (
        <Link
          to={
            settings.to
          }
          className={
            "hub-nav-group-settings" +
            (
              pathname ===
                settings.to
                ? " active"
                : ""
            )
          }
          aria-label={
            settings.label
          }
          title={
            settings.label
          }
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4V9.6h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.66 3.8l.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.4h4v.1a1.7 1.7 0 0 0 1 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1Z" />
          </svg>
        </Link>
      )}
    </div>
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
  const reviewCount = useClockReviewCount();
  const canReviewCorrections = hasPortalPermission(access, "clock.self.view")
    && ["clock.corrections.assigned", "clock.corrections.ops", "clock.corrections.all"]
      .some(permission => hasPortalPermission(access, permission));

  const agency:
    NavigationItem[] =
    [];

  if (
    capabilities
      .canViewDashboard
  ) {
    agency.push({
      id:
        "dashboard",

      label:
        "Dashboard",

      to:
        "/",
    });
  }

  if (
    capabilities
      .canManagePeople
  ) {
    agency.push({
      id:
        "people",

      label:
        "Employee Management",

      to:
        "/people",
    });
  }

  if (
    capabilities
      .canManageModels
  ) {
    agency.push({
      id:
        "models",

      label:
        "Creators",

      to:
        "/models",
    });
  }

  const administration:
    NavigationItem[] =
    [];

  if (import.meta.env.VITE_BLOCK2_CHAT_ENABLED === "true" && hasPortalPermission(access, "chat.access")) {
    agency.push({ id: "chat", label: "Chat", to: "/chat" });
  }
  if (import.meta.env.VITE_BLOCK2_CLOCK_ENABLED === "true" && hasPortalPermission(access, "clock.self.view")) {
    agency.push({ id: "clock", label: "Clock & Hours", to: "/clock", actionCount: canReviewCorrections ? reviewCount : 0 });
  }
  if (hasPortalPermission(access, "strikes.self.view")) {
    agency.push({ id: "strikes", label: "My Strikes", to: "/my-strikes" });
  }

  if (
    capabilities
      .canViewRoles
  ) {
    administration.push({
      id:
        "roles",

      label:
        "Role Settings",

      to:
        "/roles",
    });
  }

  if (
    capabilities
      .canViewAudit
  ) {
    administration.push({
      id:
        "audit",

      label:
        "Audit Log",

      to:
        "/audit",
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

        {agency
          .filter(
            (
              item
            ) =>
              item.id ===
              "dashboard"
          )
          .map(
            (
              item
            ) => (
              <NavigationLink
                key={
                  item.id
                }
                item={
                  item
                }
              />
            )
          )}

        {capabilities
          .canViewQa && (
          <ModuleNavigation
            id="quality"
            label="Quality & Incidents"
            items={
              QA_ITEMS
            }
            access={
              access
            }
          />
        )}

        {capabilities
          .canAccessStrikeManagement && (
          <ModuleNavigation
            id="strikes"
            label="Strike Management"
            items={
              STRIKE_ITEMS
            }
            access={
              access
            }
          />
        )}

        {agency
          .filter(
            (
              item
            ) =>
              item.id !==
              "dashboard"
          )
          .map(
            (
              item
            ) => (
              <NavigationLink
                key={
                  item.id
                }
                item={
                  item
                }
              />
            )
          )}
      </div>

      {administration.length >
        0 && (
        <div className="hub-nav-section">
          <p className="hub-nav-heading">
            Administration
          </p>

          {administration.map(
            (
              item
            ) => (
              <NavigationLink
                key={
                  item.id
                }
                item={
                  item
                }
              />
            )
          )}
        </div>
      )}
    </nav>
  );
}
