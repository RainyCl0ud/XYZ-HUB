import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import "./pages/AuthPages.css";

import RequireAuth from "./auth/RequireAuth";

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
import ConfigurationPage from "./pages/ConfigurationPage";

function App() {
  return (
    <Routes>
      {/* Public authentication routes */}

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

      {/* Everything below this point requires a valid session */}

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
            path="/incidents"
            element={
              <IncidentsPage />
            }
          />

          <Route
            path="/rules"
            element={
              <RulesPage />
            }
          />

          <Route
            path="/chatters"
            element={
              <ChattersPage />
            }
          />

          <Route
            path="/configuration"
            element={
              <ConfigurationPage />
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