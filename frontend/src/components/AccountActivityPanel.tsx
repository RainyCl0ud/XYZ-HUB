import {
  useEffect,
  useState,
} from "react";

import {
  apiRequest,
} from "../lib/api";


type AccountActivity = {
  id: string;
  occurredAt: string;
  action: string;
  success: boolean;
  statusCode: number;
};


type AccountActivityResponse = {
  data:
    AccountActivity[];
};


const TEXAS_TIME_ZONE =
  "America/Chicago";


function formatDateTime(
  value:
    string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        TEXAS_TIME_ZONE,
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


function getActivityLabel(
  action:
    string
) {
  switch (
    action
  ) {
    case "auth.sign_in_succeeded":
      return "Signed in";

    case "auth.sign_in_failed":
      return "Sign-in attempt failed";

    case "invite.accepted":
      return "Invitation accepted";

    case "invite.resent":
      return "Invitation resent";

    case "people.access_changed":
      return "Role assignment updated";

    case "people.group_changed":
      return "Team assignment updated";

    case "people.deactivated":
      return "Account deactivated";

    case "people.reactivated":
      return "Account reactivated";

    case "two_factor.reset":
      return "Two-factor authentication reset";

    default:
      return action
        .replaceAll(
          ".",
          " "
        )
        .replaceAll(
          "_",
          " "
        );
  }
}


function AccountActivityPanel({
  personId,
}: {
  personId:
    string;
}) {
  const [
    activity,
    setActivity,
  ] =
    useState<
      AccountActivity[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );


  useEffect(
    () => {
      let cancelled =
        false;

      void apiRequest<
        AccountActivityResponse
      >(
        `/api/people/${encodeURIComponent(
          personId
        )}/account-activity`
      )
        .then(
          (
            response
          ) => {
            if (
              cancelled
            ) {
              return;
            }

            setActivity(
              response.data
            );

            setError(
              ""
            );
          }
        )
        .catch(
          (
            loadError
          ) => {
            if (
              cancelled
            ) {
              return;
            }

            setActivity(
              []
            );

            setError(
              loadError instanceof
                Error
                ? loadError.message
                : "Unable to load account activity."
            );
          }
        )
        .finally(
          () => {
            if (
              !cancelled
            ) {
              setLoading(
                false
              );
            }
          }
        );

      return () => {
        cancelled =
          true;
      };
    },
    [
      personId,
    ]
  );


  return (
    <div className="people-detail-section people-account-access-section">
      <div className="people-detail-section-heading">
        <div>
          <h4>
            Account activity
          </h4>

          <p>
            Recent sign-in and account-access changes for this employee.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <strong>
            Loading account activity...
          </strong>
        </div>
      ) : error ? (
        <div className="empty-state">
          <strong>
            Unable to load records
          </strong>

          <span>
            {error}
          </span>
        </div>
      ) : activity.length ===
        0 ? (
        <div className="empty-state">
          <strong>
            No account activity
          </strong>

          <span>
            No account access activity has been recorded yet.
          </span>
        </div>
      ) : (
        <div className="people-account-action-stack">
          {activity.map(
            (
              item
            ) => (
              <div
                key={
                  item.id
                }
                className="people-account-action-card"
              >
                <div>
                  <strong>
                    {getActivityLabel(
                      item.action
                    )}
                  </strong>

                  <span>
                    {formatDateTime(
                      item.occurredAt
                    )}
                  </span>
                </div>

                <span
                  className={
                    item.success
                      ? "people-profile-status-pill active"
                      : "people-profile-status-pill deactivated"
                  }
                >
                  {item.success
                    ? "Completed"
                    : "Failed"}
                </span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}


export default AccountActivityPanel;
