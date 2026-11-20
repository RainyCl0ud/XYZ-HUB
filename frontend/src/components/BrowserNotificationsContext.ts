import { createContext, useContext } from 'react';
import type { HubNotification } from '../lib/hub-notifications';
export type BrowserNotificationControls = { available: boolean; supported: boolean; enabled: boolean; permission: NotificationPermission | 'unsupported'; busy: boolean; error: string; limitedScope: boolean; enable: () => Promise<void>; disable: () => void; test: () => Promise<void>; offerHubNotices: (notices: HubNotification[]) => Promise<void> };
export const BrowserNotificationsContext = createContext<BrowserNotificationControls | null>(null);
export const useBrowserNotifications = () => useContext(BrowserNotificationsContext);
