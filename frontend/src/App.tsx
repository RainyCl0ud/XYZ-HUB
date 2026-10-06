import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import "./pages/AuthPages.css";

import RequireAuth from "./auth/RequireAuth";
import RequirePermission from "./auth/RequirePermission";
import RequireSystemRole from "./auth/RequireSystemRole";
import RequirePortalModule from "./auth/RequirePortalModule";

import AppLayout from "./components/AppLayout";

import LoginPage from "./pages/LoginPage";
import TwoFactorPage from "./pages/TwoFactorPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import InviteSetupPage from "./pages/InviteSetupPage";

import DashboardPage from "./pages/DashboardPage";
import QaOverviewPage from "./pages/QaOverviewPage";
import IncidentsPage from "./pages/IncidentsPage";
import RulesPage from "./pages/RulesPage";
import ChattersPage from "./pages/ChattersPage";
import ChatterDetailPage from "./pages/ChatterDetailPage";
import ConfigurationPage from "./pages/ConfigurationPage";
import StrikesPage from "./pages/StrikesPage";
import PeoplePage from "./pages/PeoplePage";
import PeopleDetailPage from "./pages/PeopleDetailPage";
import ModelsPage from "./pages/ModelsPage";
import RoleBuilderPage from "./pages/RoleSettingsPage";
import AuditPage from "./pages/AuditPage";
import AccountPage from "./pages/AccountPage";

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <LoginPage />
        }
      />

      <Route
        path="/verify-2fa"
        element={
          <TwoFactorPage />
        }
      />

      <Route
        path="/forgot-password"
        element={
          <ForgotPasswordPage />
        }
      />

      <Route
        path="/reset-password"
        element={
          <ResetPasswordPage />
        }
      />

      <Route
        path="/invite"
        element={
          <InviteSetupPage />
        }
      />

      <Route
        element={
          <RequireAuth />
        }
      >
        <Route
          element={
            <AppLayout />
          }
        >
          <Route
            path="/"
            element={
              <DashboardPage />
            }
          />

          <Route
            path="/quality"
            element={
              <RequirePortalModule module="qa">
                <QaOverviewPage />
              </RequirePortalModule>
            }
          />

          <Route
            path="/incidents"
            element={
              <RequirePortalModule module="qa">
                <IncidentsPage />
              </RequirePortalModule>
            }
          />

          <Route
            path="/rules"
            element={
              <RequirePortalModule module="qa-config">
                <RulesPage />
              </RequirePortalModule>
            }
          />

          <Route
            path="/chatters"
            element={
              <RequirePortalModule module="qa">
                <ChattersPage />
              </RequirePortalModule>
            }
          />

          <Route
            path="/chatters/:chatterId"
            element={
              <RequirePortalModule module="qa">
                <ChatterDetailPage />
              </RequirePortalModule>
            }
          />

          <Route
            path="/rules/settings"
            element={
              <RequirePortalModule module="qa-config">
                <ConfigurationPage
                  mode="rules"
                />
              </RequirePortalModule>
            }
          />

          <Route
            path="/configuration"
            element={
              <Navigate
                to="/rules/settings"
                replace
              />
            }
          />

          <Route
            path="/strikes/settings"
            element={
              <RequirePermission permission="strikes.view">
                <RequirePermission permission="strikes.configure">
                  <ConfigurationPage
                    mode="strikes"
                  />
                </RequirePermission>
              </RequirePermission>
            }
          />

          <Route
            path="/strikes"
            element={
              <RequirePermission permission="strikes.view">
                <StrikesPage />
              </RequirePermission>
            }
          />

          <Route
            path="/people"
            element={
              <RequirePermission permission="people.manage">
                <PeoplePage />
              </RequirePermission>
            }
          />

          <Route
            path="/people/:personId"
            element={
              <RequirePermission permission="people.manage">
                <PeopleDetailPage />
              </RequirePermission>
            }
          />

          <Route
            path="/models"
            element={
              <RequirePermission permission="people.manage">
                <RequireSystemRole
                  roles={[
                    "OWNER",
                    "OPS_MANAGER",
                  ]}
                >
                  <ModelsPage />
                </RequireSystemRole>
              </RequirePermission>
            }
          />

          <Route
            path="/roles"
            element={
              <RequirePermission permission="roles.manage">
                <RequireSystemRole
                  roles={[
                    "OWNER",
                  ]}
                >
                  <RoleBuilderPage />
                </RequireSystemRole>
              </RequirePermission>
            }
          />

          <Route
            path="/audit"
            element={
              <RequireSystemRole
                roles={[
                  "OWNER",
                ]}
              >
                <AuditPage />
              </RequireSystemRole>
            }
          />

          <Route
            path="/account"
            element={
              <AccountPage />
            }
          />
        </Route>
      </Route>

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />
    </Routes>
  );
}

export default App;
