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
      <div
        className={`auth-portal-feature-icon auth-portal-feature-icon--${icon}`}
        aria-hidden="true"
      />

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
              Operations with
              <br />
              clarity and
              <br />
              <span>
                control.
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
        <aside className="auth-portal-visual" aria-hidden="true">
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
              <div className="auth-globe-grid auth-globe-grid--one" />
              <div className="auth-globe-grid auth-globe-grid--two" />
              <span className="auth-globe-light auth-globe-light--one" />
              <span className="auth-globe-light auth-globe-light--two" />
              <span className="auth-globe-light auth-globe-light--three" />
              <span className="auth-globe-light auth-globe-light--four" />
              <span className="auth-globe-light auth-globe-light--five" />
              <span className="auth-globe-light auth-globe-light--six" />
              <span className="auth-globe-light auth-globe-light--seven" />
            </div>

            <div className="auth-visual-card auth-visual-card--assignments">
              <span className="auth-visual-card-icon auth-visual-card-icon--chart" />

              <div>
                <strong>
                  Assignments
                </strong>

                <small>
                  Linked people and creator access
                </small>
              </div>
            </div>

            <div className="auth-visual-card auth-visual-card--teams">
              <span className="auth-visual-card-icon auth-visual-card-icon--people" />

              <div>
                <strong>
                  Teams
                </strong>

                <small>
                  Internal staff aligned by role
                </small>
              </div>
            </div>

            <div className="auth-visual-card auth-visual-card--oversight">
              <span className="auth-visual-card-icon auth-visual-card-icon--shield" />

              <div>
                <strong>
                  Oversight
                </strong>

                <small>
                  Controlled through secure access
                </small>
              </div>
            </div>
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
