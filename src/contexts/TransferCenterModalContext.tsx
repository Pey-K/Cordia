import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type TransferCenterModalContextType = {
  isOpen: boolean
  anchorRect: DOMRect | null
  openTransferCenter: (anchorRect: DOMRect) => void
  closeTransferCenter: () => void
}

const TransferCenterModalContext = createContext<TransferCenterModalContextType | null>(null)

export function TransferCenterModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const openTransferCenter = useCallback((rect: DOMRect) => {
    setAnchorRect(rect)
    setIsOpen(true)
  }, [])
  const closeTransferCenter = useCallback(() => {
    setIsOpen(false)
  }, [])

  const value = useMemo(
    () => ({ isOpen, anchorRect, openTransferCenter, closeTransferCenter }),
    [isOpen, anchorRect, openTransferCenter, closeTransferCenter]
  )

  return <TransferCenterModalContext.Provider value={value}>{children}</TransferCenterModalContext.Provider>
}

export function useTransferCenterModal() {
  const ctx = useContext(TransferCenterModalContext)
  if (!ctx) throw new Error('useTransferCenterModal must be used within TransferCenterModalProvider')
  return ctx
}

