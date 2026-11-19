import ChatMentionCountProvider from "./components/ChatMentionCountProvider";
import {
  StrictMode,
} from "react";

import {
  createRoot,
} from "react-dom/client";

import {
  BrowserRouter,
} from "react-router-dom";

import "./index.css";
import "./pages/PeopleViewportFit.css";
import "./components/ClientPolish.css";
import "./F4Usability.css";
import "./F5QaCleanup.css";
import "./WebKitFoundation.css";

import App from "./App";
import BrowserNotificationsProvider from './components/BrowserNotificationsProvider';
import ClockReviewCountProvider from "./components/ClockReviewCountProvider";

import {
  AuthProvider,
} from "./auth/AuthContext";

import {
  ToastProvider,
} from "./components/ToastProvider";

createRoot(
  document.getElementById(
    "root"
  )!
).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ClockReviewCountProvider>
            <ChatMentionCountProvider><BrowserNotificationsProvider><App /></BrowserNotificationsProvider></ChatMentionCountProvider>
          </ClockReviewCountProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
