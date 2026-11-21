import type {
  ReactNode,
} from "react";

import xyzManagementLogo from "../assets/xyz-management-logo.svg";

type AuthShellProps = {
  eyebrow?: string;

  title: string;

  description: ReactNode;

  // Extra class on the card, for one page's own layout.
  className?: string;

  children: ReactNode;

  footer?: ReactNode;
};

function AuthShell({
  eyebrow = "XYZ Management",
  title,
  description,
  children,
  footer,
  className,
}: AuthShellProps) {
  return (
    <div className="auth-page">
      <div className="auth-background-glow auth-background-glow-one" />
      <div className="auth-background-glow auth-background-glow-two" />

      <main className={className ? `auth-card ${className}` : "auth-card"}>
        <div className="auth-brand auth-brand-official">
          <img
            src={xyzManagementLogo}
            alt="XYZ Management"
            className="auth-brand-logo"
          />

          <div className="auth-brand-name">
            XYZ Management
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
        <footer
          className="hub-confidentiality-footer hub-confidentiality-footer-auth"
          aria-label="Confidentiality notice"
        >
          XYZ MGMT &mdash; Confidential &amp; For Internal Use Only
        </footer>
      </main>

    </div>
  );
}

export default AuthShell;
