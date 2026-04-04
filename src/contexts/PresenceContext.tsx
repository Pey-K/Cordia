import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export type PresenceLevel = 'active' | 'online' | 'offline' | 'in_call'

export interface PresenceUserStatus {
  user_id: string
  active_signing_pubkey?: string | null
}

type PresenceByHouse = Record<string, Record<string, { active_signing_pubkey?: string | null }>>

interface PresenceContextType {
  applySnapshot: (signingPubkey: string, users: PresenceUserStatus[]) => void
  applyUpdate: (
    signingPubkey: string,
    userId: string,
    online: boolean,
    activeSigningPubkey?: string | null
  ) => void
  getLevel: (signingPubkey: string, userId: string, isInCall?: boolean) => PresenceLevel
}

const PresenceContext = createContext<PresenceContextType | null>(null)

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [byHouse, setByHouse] = useState<PresenceByHouse>({})
  const byHouseRef = useRef(byHouse)
  byHouseRef.current = byHouse

  const applySnapshot: PresenceContextType['applySnapshot'] = (signingPubkey, users) => {
    setByHouse((prev) => {
      const existing = prev[signingPubkey] || {}
      const nextForHouse = { ...existing }
      for (const u of users) {
        nextForHouse[u.user_id] = { active_signing_pubkey: u.active_signing_pubkey ?? null }
      }
      return { ...prev, [signingPubkey]: nextForHouse }
    })
  }

  const applyUpdate: PresenceContextType['applyUpdate'] = (signingPubkey, userId, online, activeSigningPubkey) => {
    setByHouse((prev) => {
      const house = prev[signingPubkey] || {}
      if (!online) {
        if (!house[userId]) return prev
        const { [userId]: _, ...rest } = house
        return { ...prev, [signingPubkey]: rest }
      }
      return {
        ...prev,
        [signingPubkey]: {
          ...house,
          [userId]: { active_signing_pubkey: activeSigningPubkey ?? null },
        },
      }
    })
  }

  /** Stable value – functions close over ref so consumers never re-render from presence ticks. */
  const value = useMemo<PresenceContextType>(
    () => ({
      applySnapshot: (...args) => applySnapshot(...args),
      applyUpdate: (...args) => applyUpdate(...args),
      getLevel: (signingPubkey, userId, isInCall = false) => {
        const u = byHouseRef.current[signingPubkey]?.[userId]
        if (!u) return 'offline'
        if (isInCall) return 'in_call'
        return u.active_signing_pubkey === signingPubkey ? 'active' : 'online'
      },
    }),
    [] // stable forever – reads latest state via ref
  )

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

export function usePresence() {
  const ctx = useContext(PresenceContext)
  if (!ctx) throw new Error('usePresence must be used within a PresenceProvider')
  return ctx
}

