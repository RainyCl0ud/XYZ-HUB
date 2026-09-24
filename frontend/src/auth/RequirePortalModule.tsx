import type {
  ReactNode,
} from "react";

import {
  Navigate,
} from "react-router-dom";

import {
  useAuth,
} from "./AuthContext";

import {
  canAccessPortalModule,
  type PortalModule,
} from "./portalAccess";

function RequirePortalModule({
  module,
  children,
}: {
  module:
    PortalModule;

  children:
    ReactNode;
}) {
  const {
    access,
  } =
    useAuth();

  if (
    !canAccessPortalModule(
      access,
      module
    )
  ) {
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

export default RequirePortalModule;
