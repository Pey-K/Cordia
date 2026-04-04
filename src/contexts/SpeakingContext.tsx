import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode, useEffect } from 'react'

type SpeakingState = Record<string, boolean> // userId -> isSpeaking

interface SpeakingContextType {
  isUserSpeaking: (userId: string) => boolean
  setUserSpeaking: (userId: string, isSpeaking: boolean) => void
}

const SpeakingContext = createContext<SpeakingContextType | null>(null)

export function SpeakingProvider({ children }: { children: ReactNode }) {
  const [speakingState, setSpeakingState] = useState<SpeakingState>({})
  const speakingStateRef = useRef(speakingState)
  speakingStateRef.current = speakingState

  const setUserSpeaking = useCallback((userId: string, isSpeaking: boolean) => {
    setSpeakingState((prev) => {
      if (prev[userId] === isSpeaking) return prev
      return { ...prev, [userId]: isSpeaking }
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setSpeakingState({})
    }
  }, [])

  /** Stable value – isUserSpeaking reads from ref so speaking ticks don't re-render consumers. */
  const value = useMemo<SpeakingContextType>(
    () => ({
      isUserSpeaking: (userId: string) => speakingStateRef.current[userId] === true,
      setUserSpeaking: (...args) => setUserSpeaking(...args),
    }),
    [] // stable forever
  )

  return <SpeakingContext.Provider value={value}>{children}</SpeakingContext.Provider>
}

export function useSpeaking() {
  const ctx = useContext(SpeakingContext)
  if (!ctx) throw new Error('useSpeaking must be used within a SpeakingProvider')
  return ctx
}
