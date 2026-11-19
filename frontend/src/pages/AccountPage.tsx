import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  useAuth,
} from "../auth/AuthContext";

import {
  PEOPLE_CHANGED_EVENT,
  ApiError,
  apiRequest,
} from "../lib/api";

import {
  getCurrentUserAvatarUrl,
  prepareProfileAvatar,
} from "../lib/profile-avatar";

import UserAvatar from "../components/UserAvatar";
import AccountNotificationToggle from "../components/AccountNotificationToggle";
import "./AccountPage.css";

const CENTRAL_TIME_ZONE =
  "America/Chicago";

function formatCentralDateTime(
  value:
    string |
    null |
    undefined
) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        CENTRAL_TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }
  ).format(
    new Date(value)
  );
}

function AccountPage() {
  const {
    user,
    access,
    refreshAuth,
  } = useAuth();

  const canManageChatNotifications = import.meta.env.VITE_BLOCK2_CHAT_ENABLED === "true" && !!access?.permissions.includes("chat.access");

  const [
    avatarEditorOpen,
    setAvatarEditorOpen,
  ] =
    useState(false);

  const [
    pendingAvatar,
    setPendingAvatar,
  ] =
    useState<Blob | null>(
      null
    );

  const [
    previewUrl,
    setPreviewUrl,
  ] =
    useState<string | null>(
      null
    );

  const [
    avatarError,
    setAvatarError,
  ] =
    useState<string | null>(
      null
    );

  const [
    avatarSaving,
    setAvatarSaving,
  ] =
    useState(false);

  const fileInputRef =
    useRef<HTMLInputElement>(
      null
    );

  const roleNames =
    access?.roles.map(
      (role) => role.name
    ) ?? [];

  const currentAvatarUrl =
    getCurrentUserAvatarUrl(
      user?.avatarUpdatedAt
    );

  useEffect(
    () => {
      return () => {
        if (
          previewUrl
        ) {
          URL.revokeObjectURL(
            previewUrl
          );
        }
      };
    },
    [
      previewUrl,
    ]
  );

  function resetAvatarDraft() {
    setPendingAvatar(
      null
    );

    setAvatarError(
      null
    );

    if (
      previewUrl
    ) {
      URL.revokeObjectURL(
        previewUrl
      );

      setPreviewUrl(
        null
      );
    }

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        "";
    }
  }

  function closeAvatarEditor(
    force =
      false
  ) {
    if (
      avatarSaving &&
      !force
    ) {
      return;
    }

    setAvatarEditorOpen(
      false
    );

    resetAvatarDraft();
  }

  async function chooseAvatar(
    event:
      ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target
        .files?.[0];

    if (!file) {
      return;
    }

    setAvatarError(
      null
    );

    try {
      const prepared =
        await prepareProfileAvatar(
          file
        );

      if (
        previewUrl
      ) {
        URL.revokeObjectURL(
          previewUrl
        );
      }

      setPendingAvatar(
        prepared
      );

      setPreviewUrl(
        URL.createObjectURL(
          prepared
        )
      );
    } catch (error) {
      setPendingAvatar(
        null
      );

      if (
        previewUrl
      ) {
        URL.revokeObjectURL(
          previewUrl
        );

        setPreviewUrl(
          null
        );
      }

      setAvatarError(
        error instanceof
          Error
          ? error.message
          : "Unable to prepare the selected image."
      );
    } finally {
      event.target.value =
        "";
    }
  }

  async function saveAvatar() {
    if (
      !pendingAvatar
    ) {
      return;
    }

    setAvatarSaving(
      true
    );

    setAvatarError(
      null
    );

    try {
      await apiRequest(
        "/api/auth/avatar",
        {
          method:
            "PUT",

          headers: {
            "Content-Type":
              "image/webp",
          },

          body:
            pendingAvatar,
        }
      );

      await refreshAuth();

      window.dispatchEvent(
        new Event(
          PEOPLE_CHANGED_EVENT
        )
      );

      setAvatarSaving(
        false
      );

      closeAvatarEditor(
        true
      );
    } catch (error) {
      setAvatarError(
        error instanceof
          ApiError
          ? error.message
          : "Unable to save the profile picture."
      );

      setAvatarSaving(
        false
      );
    }
  }

  async function removeAvatar() {
    if (
      !user?.avatarUpdatedAt
    ) {
      return;
    }

    setAvatarSaving(
      true
    );

    setAvatarError(
      null
    );

    try {
      await apiRequest(
        "/api/auth/avatar",
        {
          method:
            "DELETE",
        }
      );

      await refreshAuth();

      window.dispatchEvent(
        new Event(
          PEOPLE_CHANGED_EVENT
        )
      );

      setAvatarSaving(
        false
      );

      closeAvatarEditor(
        true
      );
    } catch (error) {
      setAvatarError(
        error instanceof
          ApiError
          ? error.message
          : "Unable to remove the profile picture."
      );

      setAvatarSaving(
        false
      );
    }
  }

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
        {canManageChatNotifications && <AccountNotificationToggle />}
      </header>

      <section className="content-card account-profile-card">
        <div className="account-profile-hero">
          <button
            type="button"
            className="account-profile-avatar-button"
            aria-label="Change profile picture"
            title="Change profile picture"
            onClick={() => {
              setAvatarError(
                null
              );

              setAvatarEditorOpen(
                true
              );
            }}
          >
            <UserAvatar
              name={
                user?.name
              }
              src={
                currentAvatarUrl
              }
              className="account-profile-avatar"
            />

            <span
              className="account-profile-avatar-edit"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
              >
                <path d="M9 6 10.3 4h3.4L15 6h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3Z" />
                <circle
                  cx="12"
                  cy="12.5"
                  r="3.25"
                />
              </svg>
            </span>
          </button>

          <div className="account-profile-copy">
            <span className="account-profile-label">
              Profile
            </span>

            <h3>
              {user?.name ?? "Account"}
            </h3>

            <p>
              {user?.email}
            </p>

            <div className="account-role-list">
              {roleNames.map(
                (role) => (
                  <span key={role}>
                    {role}
                  </span>
                )
              )}
            </div>
          </div>

          <div
            className="account-status-card"
            aria-label={`Account status: ${user?.status === "ACTIVE" ? "Active" : user?.status ?? "Unknown"}`}
          >
            <span>
              Account status:
            </span>
            <strong>
              {user?.status === "ACTIVE"
                ? "Active"
                : user?.status ?? "Unknown"}
            </strong>
          </div>
        </div>

        <div className="account-profile-facts">
          <div>
            <span>
              Email
            </span>
            <strong>
              {user?.email ?? "Not available"}
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

        </div>
      </section>

      {avatarEditorOpen && (
        <div
          className="account-avatar-overlay"
          role="presentation"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeAvatarEditor();
            }
          }}
        >
          <section
            className="account-avatar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-avatar-title"
          >
            <header className="account-avatar-modal-header">
              <div>
                <span className="page-eyebrow">
                  Personal account
                </span>

                <h3 id="account-avatar-title">
                  Edit profile picture
                </h3>

                <p>
                  Choose a photo and review the square preview before saving.
                </p>
              </div>

              <button
                type="button"
                className="account-avatar-close"
                aria-label="Close profile picture editor"
                onClick={() =>
                  closeAvatarEditor()
                }
                disabled={
                  avatarSaving
                }
              >
                &times;
              </button>
            </header>

            <div className="account-avatar-modal-body">
              <UserAvatar
                name={
                  user?.name
                }
                src={
                  previewUrl ??
                  currentAvatarUrl
                }
                className="account-avatar-preview"
              />

              <input
                ref={
                  fileInputRef
                }
                className="account-avatar-file-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={
                  chooseAvatar
                }
                disabled={
                  avatarSaving
                }
              />

              <button
                type="button"
                className="secondary-button account-avatar-select"
                onClick={() =>
                  fileInputRef.current?.click()
                }
                disabled={
                  avatarSaving
                }
              >
                Select a photo
              </button>

              <p className="account-avatar-help">
                JPEG, PNG or WebP · Maximum 5 MB · The image will be center-cropped to a square.
              </p>

              {avatarError && (
                <div className="auth-message auth-message-error account-avatar-error">
                  {avatarError}
                </div>
              )}
            </div>

            <footer className="account-avatar-modal-footer">
              <div>
                {user?.avatarUpdatedAt && (
                  <button
                    type="button"
                    className="secondary-button account-avatar-remove"
                    onClick={
                      removeAvatar
                    }
                    disabled={
                      avatarSaving
                    }
                  >
                    Remove photo
                  </button>
                )}
              </div>

              <div className="account-avatar-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    closeAvatarEditor()
                  }
                  disabled={
                    avatarSaving
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={
                    saveAvatar
                  }
                  disabled={
                    avatarSaving ||
                    !pendingAvatar
                  }
                >
                  {avatarSaving
                    ? "Saving..."
                    : "Save photo"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

export default AccountPage;
