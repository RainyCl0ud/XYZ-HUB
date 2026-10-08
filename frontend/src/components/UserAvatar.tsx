import {
  useState,
} from "react";

import "./UserAvatar.css";

type UserAvatarProps = {
  name:
    string |
    null |
    undefined;

  src?:
    string |
    null;

  className?:
    string;

  alt?:
    string;
};

function getInitials(
  name:
    string |
    null |
    undefined
) {
  if (!name) {
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

function UserAvatar({
  name,
  src = null,
  className = "",
  alt,
}: UserAvatarProps) {
  const [
    failedSrc,
    setFailedSrc,
  ] =
    useState<string | null>(
      null
    );

  const imageFailed =
    Boolean(
      src &&
      failedSrc ===
        src
    );

  return (
    <span
      className={`user-avatar ${className}`.trim()}
    >
      {src &&
      !imageFailed ? (
        <img
          src={
            src
          }
          alt={
            alt ??
            `${name ?? "User"} profile picture`
          }
          onError={() =>
            setFailedSrc(
              src
            )
          }
        />
      ) : (
        <span
          className="user-avatar-initials"
          aria-hidden="true"
        >
          {getInitials(
            name
          )}
        </span>
      )}
    </span>
  );
}

export default UserAvatar;
