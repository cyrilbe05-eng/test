import { useState, useEffect } from 'react'
import { MOCK_NOTIFICATIONS, _notificationsStore } from './mockData'
import type { Notification } from '@/types'

// Combine static seed data with runtime-pushed notifications
function getAll(userId: string): Notification[] {
  return [
    ...MOCK_NOTIFICATIONS.filter((n) => n.recipient_id === userId),
    ..._notificationsStore.filter((n) => n.recipient_id === userId),
  ]
}

// Module-level listeners so pushNotification() can trigger re-renders
const _listeners: Array<() => void> = []
export function triggerNotificationUpdate() {
  _listeners.forEach((fn) => fn())
}

export function useDemoNotifications(userId: string) {
  const [notifications, setNotifications] = useState<Notification[]>(() => getAll(userId))

  // Re-sync when runtime notifications are pushed
  useEffect(() => {
    const fn = () => setNotifications(getAll(userId))
    _listeners.push(fn)
    return () => {
      const idx = _listeners.indexOf(fn)
      if (idx !== -1) _listeners.splice(idx, 1)
    }
  }, [userId])

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, unreadCount, markRead, markAllRead, isLoading: false }
}
