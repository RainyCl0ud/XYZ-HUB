import { lazy, Suspense } from "react";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import "./pages/AuthPages.css";

import RequireAuth from "./auth/RequireAuth";
import RequirePermission from "./auth/RequirePermission";

import AppLayout from "./components/AppLayout";

import LoginPage from "./pages/LoginPage";
import TwoFactorPage from "./pages/TwoFactorPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import InviteSetupPage from "./pages/InviteSetupPage";

import DashboardPage from "./pages/DashboardPage";
import IncidentsPage from "./pages/IncidentsPage";
import RulesPage from "./pages/RulesPage";
import ChattersPage from "./pages/ChattersPage";
import ChatterDetailPage from "./pages/ChatterDetailPage";
import ConfigurationPage from "./pages/ConfigurationPage";
import StrikesPage from "./pages/StrikesPage";
import StrikeReasonsPage from "./pages/StrikeReasonsPage";
import PeoplePage from "./pages/PeoplePage";
import PeopleDetailPage from "./pages/PeopleDetailPage";
import ModelsPage from "./pages/ModelsPage";
import RoleBuilderPage from "./pages/RoleSettingsPage";
import AuditPage from "./pages/AuditPage";
import AccountPage from "./pages/AccountPage";
const ChatPage = lazy(() => import("./pages/ChatPage"));
const ClockWorkspaceRoute = lazy(() => import("./pages/ClockWorkspaceRoute"));
const ClockRequestDetailPage = lazy(() => import("./pages/ClockRequestDetailPage"));
const MyStrikesPage = lazy(() => import("./pages/MyStrikesPage"));


function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-2fa" element={<TwoFactorPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite" element={<InviteSetupPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          {import.meta.env.VITE_BLOCK2_CLOCK_ENABLED === "true" && <Route path="/clock" element={<RequirePermission permission="clock.self.view"><Suspense fallback={<p role="status">Loading your hours…</p>}><ClockWorkspaceRoute /></Suspense></RequirePermission>} />}
          {import.meta.env.VITE_BLOCK2_CLOCK_ENABLED === "true" && <Route
            path="/clock/requests/:requestId"
            element={<RequirePermission permission="clock.self.view">
              <Suspense fallback={<p role="status">Loading request details…</p>}><ClockRequestDetailPage /></Suspense>
            </RequirePermission>}
          />}
          {import.meta.env.VITE_BLOCK2_CHAT_ENABLED === "true" && <Route path="/chat" element={<RequirePermission permission="chat.access"><Suspense fallback={<p role="status">Loading chat…</p>}><ChatPage /></Suspense></RequirePermission>} />}
          <Route
            path="/"
            element={
              <RequirePermission permission="dashboard.view">
                <DashboardPage />
              </RequirePermission>
            }
          />

          <Route
            path="/quality"
            element={
              <RequirePermission permission="quality.access">
                <Navigate
                  to="/incidents"
                  replace
                />
              </RequirePermission>
            }
          />

          <Route
            path="/incidents"
            element={
              <RequirePermission permission="quality.incidents.view">
                <IncidentsPage />
              </RequirePermission>
            }
          />

          <Route
            path="/rules"
            element={
              <RequirePermission permission="quality.rules.view">
                <RulesPage />
              </RequirePermission>
            }
          />

          <Route
            path="/chatters"
            element={
              <RequirePermission permission="quality.chatters.view">
                <ChattersPage />
              </RequirePermission>
            }
          />

          <Route
            path="/chatters/:chatterId"
            element={
              <RequirePermission permission="quality.chatters.view">
                <ChatterDetailPage />
              </RequirePermission>
            }
          />

          <Route
            path="/rules/settings"
            element={
              <RequirePermission permission="quality.rules.manage">
                <ConfigurationPage mode="rules" />
              </RequirePermission>
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
            path="/my-strikes"
            element={
              <RequirePermission permission="strikes.self.view">
                <Suspense fallback={<p role="status">Loading your strikes…</p>}><MyStrikesPage /></Suspense>
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
            path="/strikes/reasons"
            element={
              <RequirePermission permission="strikes.reasons.view">
                <StrikeReasonsPage />
              </RequirePermission>
            }
          />

          <Route
            path="/strikes/settings"
            element={
              <RequirePermission permission="strikes.ladder.view">
                <ConfigurationPage mode="strikes" />
              </RequirePermission>
            }
          />

          <Route
            path="/people"
            element={
              <RequirePermission permission="people.access">
                <PeoplePage />
              </RequirePermission>
            }
          />

          <Route
            path="/people/:personId"
            element={
              <RequirePermission permission="people.profile.view">
                <PeopleDetailPage />
              </RequirePermission>
            }
          />

          <Route
            path="/models"
            element={
              <RequirePermission permission="models.access">
                <ModelsPage />
              </RequirePermission>
            }
          />

          <Route
            path="/roles"
            element={
              <RequirePermission permission="roles.access">
                <RoleBuilderPage />
              </RequirePermission>
            }
          />

          <Route
            path="/audit"
            element={
              <RequirePermission permission="audit.access">
                <AuditPage />
              </RequirePermission>
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
