import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type VoicePresenceByServer = Record<string, Record<string, Set<string>>> // signing_pubkey -> chat_id -> Set of user_ids

interface VoicePresenceContextType {
  getVoiceParticipants: (signingPubkey: string, chatId: string) => string[]  // Returns user_ids in voice for a chat
  isUserInVoice: (signingPubkey: string, userId: string) => boolean  // Check if user is in voice in any chat
  removeUserFromAllRooms: (signingPubkey: string, userId: string) => void  // Remove user from all chats in a server
  applyUpdate: (signingPubkey: string, userId: string, chatId: string, inVoice: boolean) => void
  applySnapshot: (signingPubkey: string, chatId: string, userIds: string[]) => void
}

const VoicePresenceContext = createContext<VoicePresenceContextType | null>(null)

export function VoicePresenceProvider({ children }: { children: ReactNode }) {
  const [byServer, setByServer] = useState<VoicePresenceByServer>({})

  const applyUpdate: VoicePresenceContextType['applyUpdate'] = (signingPubkey, userId, chatId, inVoice) => {
    setByServer((prev) => {
      const server = prev[signingPubkey] || {}
      const chat = server[chatId] || new Set<string>()

      if (inVoice) {
        const updatedChat = new Set(chat)
        updatedChat.add(userId)
        return {
          ...prev,
          [signingPubkey]: {
            ...server,
            [chatId]: updatedChat,
          },
        }
      } else {
        if (!chat.has(userId)) return prev
        const updatedChat = new Set(chat)
        updatedChat.delete(userId)
        const updatedServer = { ...server }
        if (updatedChat.size === 0) {
          delete updatedServer[chatId]
        } else {
          updatedServer[chatId] = updatedChat
        }
        if (Object.keys(updatedServer).length === 0) {
          const { [signingPubkey]: _, ...rest } = prev
          return rest
        }
        return {
          ...prev,
          [signingPubkey]: updatedServer,
        }
      }
    })
  }

  const applySnapshot: VoicePresenceContextType['applySnapshot'] = (signingPubkey, chatId, userIds) => {
    setByServer((prev) => {
      const server = prev[signingPubkey] || {}
      return {
        ...prev,
        [signingPubkey]: {
          ...server,
          [chatId]: new Set(userIds),
        },
      }
    })
  }

  const getVoiceParticipants: VoicePresenceContextType['getVoiceParticipants'] = (signingPubkey, chatId) => {
    const server = byServer[signingPubkey]
    if (!server) return []
    const chat = server[chatId]
    if (!chat) return []
    return Array.from(chat)
  }

  const isUserInVoice: VoicePresenceContextType['isUserInVoice'] = (signingPubkey, userId) => {
    const server = byServer[signingPubkey]
    if (!server) return false
    for (const chat of Object.values(server)) {
      if (chat.has(userId)) {
        return true
      }
    }
    return false
  }

  const removeUserFromAllRooms: VoicePresenceContextType['removeUserFromAllRooms'] = (signingPubkey, userId) => {
    setByServer((prev) => {
      const server = prev[signingPubkey]
      if (!server) return prev
      const updatedServer = { ...server }
      let hasChanges = false
      for (const chatId of Object.keys(updatedServer)) {
        const chat = updatedServer[chatId]
        if (chat.has(userId)) {
          const updatedChat = new Set(chat)
          updatedChat.delete(userId)
          if (updatedChat.size === 0) {
            delete updatedServer[chatId]
          } else {
            updatedServer[chatId] = updatedChat
          }
          hasChanges = true
        }
      }
      if (!hasChanges) return prev
      if (Object.keys(updatedServer).length === 0) {
        const { [signingPubkey]: _, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [signingPubkey]: updatedServer,
      }
    })
  }

  const value = useMemo(
    () => ({ applyUpdate, applySnapshot, getVoiceParticipants, isUserInVoice, removeUserFromAllRooms }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [byServer]
  )

  return <VoicePresenceContext.Provider value={value}>{children}</VoicePresenceContext.Provider>
}

export function useVoicePresence() {
  const ctx = useContext(VoicePresenceContext)
  if (!ctx) throw new Error('useVoicePresence must be used within a VoicePresenceProvider')
  return ctx
}
