import {
  useAuth,
} from "../auth/AuthContext";

import "./AccountPage.css";

const CENTRAL_TIME_ZONE =
  "America/Chicago";

function getInitials(
  name:
    string |
    undefined
) {
  if (
    !name
  ) {
    return "U";
  }

  const parts =
    name
      .trim()
      .split(
        /\s+/
      )
      .filter(
        Boolean
      );

  if (
    parts.length ===
      0
  ) {
    return "U";
  }

  if (
    parts.length ===
      1
  ) {
    return parts[0]
      .slice(
        0,
        2
      )
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[
      parts.length -
        1
    ][0]
  ).toUpperCase();
}

function formatCentralDateTime(
  value:
    string |
    null |
    undefined
) {
  if (
    !value
  ) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        CENTRAL_TIME_ZONE,
      month:
        "short",
      day:
        "numeric",
      year:
        "numeric",
      hour:
        "numeric",
      minute:
        "2-digit",
      timeZoneName:
        "short",
    }
  ).format(
    new Date(
      value
    )
  );
}

function AccountPage() {
  const {
    user,
    access,
  } =
    useAuth();

  const roleNames =
    access?.roles.map(
      (
        role
      ) =>
        role.name
    ) ?? [];

  return (
    <div className="page account-page">
      <header className="page-header account-page-header">
        <div>
          <p className="page-eyebrow">
            Personal account
          </p>

          <h2>
            My Account
          </h2>

          <p className="page-description">
            Review your profile and current XYZ Management access.
          </p>
        </div>
      </header>

      <section className="content-card account-profile-card">
        <div className="account-profile-hero">
          <div
            className="account-profile-avatar"
            aria-hidden="true"
          >
            {getInitials(
              user?.name
            )}
          </div>

          <div className="account-profile-copy">
            <span className="account-profile-label">
              Profile
            </span>

            <h3>
              {user?.name ??
                "Account"}
            </h3>

            <p>
              {user?.email}
            </p>

            <div className="account-role-list">
              {roleNames.map(
                (
                  role
                ) => (
                  <span
                    key={
                      role
                    }
                  >
                    {role}
                  </span>
                )
              )}
            </div>
          </div>

          <div className="account-status-card">
            <span>
              Account status
            </span>

            <strong>
              {user?.status ===
              "ACTIVE"
                ? "Active"
                : user?.status ??
                  "Unknown"}
            </strong>
          </div>
        </div>

        <div className="account-profile-facts">
          <div>
            <span>
              Email
            </span>

            <strong>
              {user?.email ??
                "Not available"}
            </strong>
          </div>

          <div>
            <span>
              Last sign-in
            </span>

            <strong>
              {formatCentralDateTime(
                user?.lastSignInAt
              )}
            </strong>
          </div>

          <div>
            <span>
              Access scope
            </span>

            <strong>
              {access?.effectiveDataScope
                ?.replaceAll(
                  "_",
                  " "
                ) ??
                "Not available"}
            </strong>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AccountPage;
