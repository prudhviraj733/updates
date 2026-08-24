import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as Notifications from "expo-notifications";
import api from "../api/client";
import { useAuth } from "./AuthContext";
import { registerForPushNotifications, addNotificationListeners } from "../lib/push";

const NotificationContext = createContext(null);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true,
  }),
});

export function NotificationProvider({ children, navigationRef }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const registered = useRef(false);

  const loggedIn = user && user !== false;

  const refreshCount = useCallback(async () => {
    if (!loggedIn) { setUnread(0); return; }
    try { const { data } = await api.get("/me/notifications/unread-count"); setUnread(data.count || 0); }
    catch { /* noop */ }
  }, [loggedIn]);

  const loadItems = useCallback(async () => {
    if (!loggedIn) return;
    setLoading(true);
    try { const { data } = await api.get("/me/notifications"); setItems(data || []); }
    catch { /* noop */ } finally { setLoading(false); }
  }, [loggedIn]);

  const markRead = useCallback(async (id) => {
    setItems((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((c) => Math.max(0, c - 1));
    try { await api.post(`/me/notifications/${id}/read`); } catch { /* noop */ }
    refreshCount();
  }, [refreshCount]);

  const markAllRead = useCallback(async () => {
    setItems((p) => p.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try { await api.post("/me/notifications/read-all"); } catch { /* noop */ }
  }, []);

  // Register the device's real FCM token once logged in.
  useEffect(() => {
    if (loggedIn && !registered.current) {
      registered.current = true;
      registerForPushNotifications();
    }
    if (!loggedIn) registered.current = false;
  }, [loggedIn]);

  // Poll unread count + wire tap -> deep link navigation.
  useEffect(() => {
    refreshCount();
    if (!loggedIn) return;
    const t = setInterval(refreshCount, 45000);
    const cleanup = addNotificationListeners((deepLink) => {
      if (deepLink && navigationRef?.current) {
        // deepLink e.g. /orders/<id>, /product/<id>, /offers
        try { navigationRef.current.navigate("DeepLink", { path: deepLink }); } catch { /* noop */ }
      }
      refreshCount();
    });
    return () => { clearInterval(t); cleanup && cleanup(); };
  }, [loggedIn, refreshCount, navigationRef]);

  return (
    <NotificationContext.Provider value={{ unread, items, loading, loadItems, markRead, markAllRead, refreshCount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
