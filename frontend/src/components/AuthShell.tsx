import type {
  ReactNode,
} from "react";

type AuthShellProps = {
  eyebrow?: string;

  title: string;

  description: string;

  children: ReactNode;

  footer?: ReactNode;
};

function AuthShell({
  eyebrow = "XYZ Hub",
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="auth-page">
      <div className="auth-background-glow auth-background-glow-one" />
      <div className="auth-background-glow auth-background-glow-two" />

      <main className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">
            X
          </div>

          <div>
            <div className="auth-brand-name">
              XYZ Hub
            </div>

            <div className="auth-brand-subtitle">
              Agency Operation Management
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