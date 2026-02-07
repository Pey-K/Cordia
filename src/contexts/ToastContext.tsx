import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle } from 'lucide-react'

type ToastContextType = {
  toast: (message: string) => void
  toastPersistent: (message: string) => void
  dismissToast: () => void
}

const ToastContext = createContext<ToastContextType | null>(null)

const TOAST_DURATION_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [isPersistent, setIsPersistent] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toast = useCallback((msg: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setMessage(msg)
    setIsPersistent(false)
    setVisible(true)
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      setVisible(false)
      setTimeout(() => setMessage(null), 200)
    }, TOAST_DURATION_MS)
  }, [])

  const toastPersistent = useCallback((msg: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setMessage(msg)
    setIsPersistent(true)
    setVisible(true)
  }, [])

  const dismissToast = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    setVisible(false)
    setTimeout(() => setMessage(null), 200)
  }, [])

  const toastEl = message ? (
    <div
      className={`fixed bottom-8 left-1/2 z-[9999] flex flex-col overflow-hidden w-max max-w-[min(28rem,calc(100vw-2rem))] mx-4 rounded-md bg-destructive text-white shadow-lg cursor-pointer transition-all duration-200 ${
        visible ? 'toast-slide-in' : 'opacity-0 -translate-x-1/2 translate-y-4'
      }`}
      role="alert"
      onClick={dismissToast}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/20">
          <AlertCircle className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-semibold">Error!</span>{' '}
          <span className="font-normal">{message}</span>
        </div>
      </div>
      {!isPersistent && (
        <div
          className="h-0.5 w-full bg-white toast-countdown-bar"
          style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}
        />
      )}
    </div>
  ) : null

  return (
    <ToastContext.Provider value={{ toast, toastPersistent, dismissToast }}>
      {children}
      {typeof document !== 'undefined' && toastEl && createPortal(toastEl, document.body)}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
