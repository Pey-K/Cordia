import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type NotificationsModalContextType = {
  isOpen: boolean
  anchorRect: DOMRect | null
  openNotifications: (anchorRect: DOMRect) => void
  closeNotifications: () => void
}

const NotificationsModalContext = createContext<NotificationsModalContextType | null>(null)

export function NotificationsModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const openNotifications = useCallback((rect: DOMRect) => {
    setAnchorRect(rect)
    setIsOpen(true)
  }, [])
  const closeNotifications = useCallback(() => {
    setIsOpen(false)
  }, [])

  const value = useMemo(
    () => ({ isOpen, anchorRect, openNotifications, closeNotifications }),
    [isOpen, anchorRect, openNotifications, closeNotifications]
  )

  return (
    <NotificationsModalContext.Provider value={value}>
      {children}
    </NotificationsModalContext.Provider>
  )
}

export function useNotificationsModal() {
  const ctx = useContext(NotificationsModalContext)
  if (!ctx) throw new Error('useNotificationsModal must be used within NotificationsModalProvider')
  return ctx
}
