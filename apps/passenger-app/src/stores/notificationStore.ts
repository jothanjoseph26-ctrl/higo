import { create } from 'zustand';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  push: (notification: Omit<NotificationItem, 'id' | 'read' | 'createdAt'>) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  markRead(id: string) {
    const updated = get().notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    const unread = updated.filter((n) => !n.read).length;
    set({ notifications: updated, unreadCount: unread });
  },

  markAllRead() {
    const updated = get().notifications.map((n) => ({ ...n, read: true }));
    set({ notifications: updated, unreadCount: 0 });
  },

  push(notification) {
    const newItem: NotificationItem = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      read: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [newItem, ...get().notifications];
    set({ notifications: updated, unreadCount: updated.filter((n) => !n.read).length });
  },

  clearAll() {
    set({ notifications: [], unreadCount: 0 });
  },
}));
