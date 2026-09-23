import type {
  ReactNode,
} from "react";

import {
  Navigate,
} from "react-router-dom";

import {
  useAuth,
} from "./AuthContext";

function RequireSystemRole({
  roles,
  children,
}: {
  roles:
    string[];

  children:
    ReactNode;
}) {
  const {
    access,
  } =
    useAuth();

  const allowed =
    access?.roles.some(
      (
        role
      ) =>
        role.systemKey !==
          null &&
        roles.includes(
          role.systemKey
        )
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

export default RequireSystemRole;
