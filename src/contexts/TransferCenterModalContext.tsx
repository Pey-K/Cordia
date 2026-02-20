import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type TransferCenterModalContextType = {
  isOpen: boolean
  anchorRect: DOMRect | null
  /** Ref the transfer button assigns so the modal can re-read position on resize and stay attached. */
  anchorRef: React.RefObject<HTMLElement | null>
  openTransferCenter: (anchorRect: DOMRect) => void
  closeTransferCenter: () => void
}

const TransferCenterModalContext = createContext<TransferCenterModalContextType | null>(null)

export function TransferCenterModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)

  const openTransferCenter = useCallback((rect: DOMRect) => {
    setAnchorRect(rect)
    setIsOpen(true)
  }, [])
  const closeTransferCenter = useCallback(() => {
    setIsOpen(false)
  }, [])

  const value = useMemo(
    () => ({ isOpen, anchorRect, anchorRef, openTransferCenter, closeTransferCenter }),
    [isOpen, anchorRect, openTransferCenter, closeTransferCenter]
  )

  return <TransferCenterModalContext.Provider value={value}>{children}</TransferCenterModalContext.Provider>
}

export function useTransferCenterModal() {
  const ctx = useContext(TransferCenterModalContext)
  if (!ctx) throw new Error('useTransferCenterModal must be used within TransferCenterModalProvider')
  return ctx
}

