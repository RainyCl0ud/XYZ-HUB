import type {
  ReactNode,
} from "react";

import {
  useAuth,
} from "./AuthContext";

import {
  hasPortalPermission,
} from "./portalAccess";


function RequirePermission({
  permission,
  children,
}: {
  permission:
    string;

  children:
    ReactNode;
}) {
  const {
    access,
  } =
    useAuth();

  const allowed =
    hasPortalPermission(
      access,
      permission
    );

  if (!allowed) {
    return (
      <div className="page">
        <section className="content-card">
          <p className="page-eyebrow">
            Access control
          </p>

          <h2>
            Access denied
          </h2>

          <p className="page-description">
            Your assigned role does not include access to this page.
          </p>
        </section>
      </div>
    );
  }

  return (
    <>
      {children}
    </>
  );
}


export default RequirePermission;
