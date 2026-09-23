import type {
  ReactNode,
} from "react";

import {
  Navigate,
} from "react-router-dom";

import {
  useAuth,
} from "./AuthContext";

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
    access?.permissions.includes(
      permission
    ) ??
    false;

  if (!allowed) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return (
    <>
      {children}
    </>
  );
}

export default RequirePermission;
