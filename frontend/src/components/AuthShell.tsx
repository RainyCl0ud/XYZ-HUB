import type {
  ReactNode,
} from "react";

type AuthShellProps = {
  eyebrow?: string;

  title: string;

  description: string;

  children: ReactNode;

  footer?: ReactNode;

  immersive?: boolean;

  brandSubtitle?: string;
};

type PortalGlyphName =
  | "staff"
  | "assignments"
  | "operations"
  | "teams"
  | "oversight";

function PortalGlyph({
  name,
}: {
  name:
    PortalGlyphName;
}) {
  if (
    name ===
    "assignments"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M4 17.5 9.2 12l3.7 3.5L20 7.5" />
        <path d="M15.5 7.5H20V12" />
      </svg>
    );
  }

  if (
    name ===
      "staff" ||
    name ===
      "teams"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          cx="9"
          cy="8"
          r="2.7"
        />
        <circle
          cx="16.3"
          cy="9.3"
          r="2.1"
        />
        <path d="M3.9 18.2c.6-3.2 2.4-4.8 5.2-4.8s4.7 1.6 5.3 4.8" />
        <path d="M14.2 14.1c2.8-.1 4.7 1.2 5.4 3.9" />
      </svg>
    );
  }

  if (
    name ===
    "oversight"
  ) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M12 3.6 18.2 6v5.2c0 4-2 7.1-6.2 9.2-4.2-2.1-6.2-5.2-6.2-9.2V6L12 3.6Z" />
        <path d="m9.4 11.7 1.8 1.8 3.6-4" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 3.8a8.2 8.2 0 1 0 8.2 8.2A8.2 8.2 0 0 0 12 3.8Z" />
      <path d="M12 7.7v4.7l3.1 1.8" />
    </svg>
  );
}

function PortalFeature({
  icon,
  title,
  description,
}: {
  icon:
    "staff" |
    "assignments" |
    "operations";

  title:
    string;

  description:
    string;
}) {
  return (
    <div className="auth-portal-feature">
      <div className="auth-portal-feature-icon">
        <PortalGlyph
          name={
            icon
          }
        />
      </div>

      <div>
        <strong>
          {title}
        </strong>

        <span>
          {description}
        </span>
      </div>
    </div>
  );
}

function VisualCard({
  className,
  icon,
  title,
  description,
}: {
  className:
    string;

  icon:
    "assignments" |
    "teams" |
    "oversight";

  title:
    string;

  description:
    string;
}) {
  return (
    <div
      className={`auth-visual-card ${className}`}
    >
      <span className="auth-visual-card-icon">
        <PortalGlyph
          name={
            icon
          }
        />
      </span>

      <div>
        <strong>
          {title}
        </strong>

        <small>
          {description}
        </small>
      </div>
    </div>
  );
}

function AuthShell({
  eyebrow = "XYZ Hub",
  title,
  description,
  children,
  footer,
  immersive = false,
  brandSubtitle = "Agency Operation Management",
}: AuthShellProps) {
  return (
    <div
      className={
        immersive
          ? "auth-page auth-page--immersive"
          : "auth-page"
      }
    >
      <div className="auth-background-grid" />
      <div className="auth-background-glow auth-background-glow-one" />
      <div className="auth-background-glow auth-background-glow-two" />

      {immersive && (
        <aside className="auth-portal-intro">
          <div className="auth-portal-brand">
            <div className="auth-brand-mark">
              X
            </div>

            <div>
              <div className="auth-brand-name">
                XYZ Hub
              </div>

              <div className="auth-brand-subtitle">
                Internal Operations Portal
              </div>
            </div>
          </div>

          <div className="auth-portal-intro-copy">
            <p className="auth-eyebrow">
              Agency staff workspace
            </p>

            <h2>
              Operations
              <br />
              with clarity
              <br />
              <span>
                and control.
              </span>
            </h2>

            <p className="auth-portal-summary">
              XYZ Hub gives internal staff one place
              to manage team access, creator
              assignments, and day-to-day workflows.
            </p>
          </div>

          <div className="auth-portal-features">
            <PortalFeature
              icon="staff"
              title="Staff Access"
              description="Roles, permissions, and secure account control."
            />

            <PortalFeature
              icon="assignments"
              title="Assignments"
              description="Team members, creator assignments, and visibility by role."
            />

            <PortalFeature
              icon="operations"
              title="Daily Operations"
              description="A centralized workspace for internal workflows."
            />
          </div>

          <div className="auth-portal-tagline">
            <span />

            <p>
              Internal tools.
              <br />
              Aligned teams.
            </p>
          </div>
        </aside>
      )}

      <main
        className={
          immersive
            ? "auth-card auth-card--immersive"
            : "auth-card"
        }
      >
        <div className="auth-brand">
          <div className="auth-brand-mark">
            X
          </div>

          <div>
            <div className="auth-brand-name">
              XYZ Hub
            </div>

            <div className="auth-brand-subtitle">
              {brandSubtitle}
            </div>
          </div>
        </div>

        <div className="auth-heading">
          <p className="auth-eyebrow">
            {eyebrow}
          </p>

          <h1>
            {title}
          </h1>

          <p className="auth-description">
            {description}
          </p>
        </div>

        {children}

        {footer && (
          <div className="auth-footer">
            {footer}
          </div>
        )}
      </main>

      {immersive && (
        <aside
          className="auth-portal-visual"
          aria-hidden="true"
        >
          <div className="auth-portal-quote">
            <span />

            <p>
              Secure access.
              <br />
              Clear coordination.
            </p>
          </div>

          <div className="auth-globe-scene">
            <div className="auth-globe-orbit auth-globe-orbit--one" />
            <div className="auth-globe-orbit auth-globe-orbit--two" />
            <div className="auth-globe-orbit auth-globe-orbit--three" />

            <div className="auth-globe">
              <div className="auth-earth-glow" />
              <div className="auth-continent auth-continent--north-america" />
              <div className="auth-continent auth-continent--central-america" />
              <div className="auth-continent auth-continent--south-america" />
              <div className="auth-city-lights auth-city-lights--north" />
              <div className="auth-city-lights auth-city-lights--south" />
              <div className="auth-globe-grid auth-globe-grid--longitude" />
              <div className="auth-globe-grid auth-globe-grid--latitude" />

              <span className="auth-globe-light auth-globe-light--one" />
              <span className="auth-globe-light auth-globe-light--two" />
              <span className="auth-globe-light auth-globe-light--three" />
              <span className="auth-globe-light auth-globe-light--four" />
              <span className="auth-globe-light auth-globe-light--five" />
              <span className="auth-globe-light auth-globe-light--six" />
              <span className="auth-globe-light auth-globe-light--seven" />
              <span className="auth-globe-light auth-globe-light--eight" />
              <span className="auth-globe-light auth-globe-light--nine" />
            </div>

            <VisualCard
              className="auth-visual-card--assignments"
              icon="assignments"
              title="Assignments"
              description="Linked people and creator access"
            />

            <VisualCard
              className="auth-visual-card--teams"
              icon="teams"
              title="Teams"
              description="Internal staff aligned by role"
            />

            <VisualCard
              className="auth-visual-card--oversight"
              icon="oversight"
              title="Oversight"
              description="Controlled through secure access"
            />
          </div>

          <div className="auth-portal-keywords">
            <span>
              People
            </span>

            <span>
              Access
            </span>

            <span>
              Assignments
            </span>

            <span>
              Operations
            </span>
          </div>
        </aside>
      )}

      <div className="auth-environment">
        <span className="environment-dot" />

        <span>
          {import.meta.env.VITE_APP_ENV ??
            "Development"}
        </span>
      </div>
    </div>
  );
}

export default AuthShell;
