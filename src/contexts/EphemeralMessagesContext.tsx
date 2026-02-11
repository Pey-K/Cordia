import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  decryptEphemeralChatMessageBySigningPubkey,
  encryptEphemeralChatMessage,
} from '../lib/tauri'
import { useAccount } from './AccountContext'

export interface EphemeralChatMessage {
  id: string
  signing_pubkey: string
  chat_id: string
  from_user_id: string
  text: string
  sent_at: string
  local_only?: boolean
}

interface SendEphemeralChatInput {
  serverId: string
  signingPubkey: string
  chatId: string
  fromUserId: string
  text: string
}

interface IncomingEphemeralChatDetail {
  signing_pubkey: string
  chat_id: string
  from_user_id: string
  encrypted_payload: string
  sent_at: string
}

interface EphemeralMessagesContextType {
  getMessages: (signingPubkey: string, chatId: string) => EphemeralChatMessage[]
  sendMessage: (input: SendEphemeralChatInput) => Promise<void>
}

const EphemeralMessagesContext = createContext<EphemeralMessagesContextType | null>(null)

type MessageBuckets = Record<string, EphemeralChatMessage[]>

function bucketKey(signingPubkey: string, chatId: string): string {
  return `${signingPubkey}::${chatId}`
}

function appendMessage(
  prev: MessageBuckets,
  signingPubkey: string,
  chatId: string,
  msg: EphemeralChatMessage
): MessageBuckets {
  const key = bucketKey(signingPubkey, chatId)
  const existing = prev[key] ?? []
  return { ...prev, [key]: [...existing, msg] }
}

export function EphemeralMessagesProvider({ children }: { children: ReactNode }) {
  const { currentAccountId } = useAccount()
  const [messagesByBucket, setMessagesByBucket] = useState<MessageBuckets>({})

  // Ephemeral by design: reset in-memory messages when account changes.
  useEffect(() => {
    setMessagesByBucket({})
  }, [currentAccountId])

  useEffect(() => {
    let cancelled = false
    const onIncoming = async (e: Event) => {
      const detail = (e as CustomEvent<IncomingEphemeralChatDetail>).detail
      if (!detail?.signing_pubkey || !detail.chat_id || !detail.encrypted_payload) return

      try {
        const plaintext = await decryptEphemeralChatMessageBySigningPubkey(
          detail.signing_pubkey,
          detail.encrypted_payload
        )
        if (cancelled) return
        const parsed = JSON.parse(plaintext) as { text?: string }
        const text = (parsed.text ?? '').trim()
        if (!text) return

        const msg: EphemeralChatMessage = {
          id: `${detail.sent_at}:${detail.from_user_id}:${Math.random().toString(36).slice(2)}`,
          signing_pubkey: detail.signing_pubkey,
          chat_id: detail.chat_id,
          from_user_id: detail.from_user_id,
          text,
          sent_at: detail.sent_at || new Date().toISOString(),
        }
        setMessagesByBucket((prev) =>
          appendMessage(prev, detail.signing_pubkey, detail.chat_id, msg)
        )
      } catch {
        // Ignore payloads we cannot decrypt (e.g. not a member of that server).
      }
    }

    window.addEventListener('cordia:ephemeral-chat-incoming', onIncoming as EventListener)
    return () => {
      cancelled = true
      window.removeEventListener('cordia:ephemeral-chat-incoming', onIncoming as EventListener)
    }
  }, [])

  const getMessages = (signingPubkey: string, chatId: string): EphemeralChatMessage[] => {
    if (!signingPubkey || !chatId) return []
    return messagesByBucket[bucketKey(signingPubkey, chatId)] ?? []
  }

  const sendMessage: EphemeralMessagesContextType['sendMessage'] = async ({
    serverId,
    signingPubkey,
    chatId,
    fromUserId,
    text,
  }) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const payload = JSON.stringify({ text: trimmed })
    const encrypted_payload = await encryptEphemeralChatMessage(serverId, payload)
    const sentAt = new Date().toISOString()

    window.dispatchEvent(
      new CustomEvent('cordia:send-ephemeral-chat', {
        detail: {
          signing_pubkey: signingPubkey,
          chat_id: chatId,
          encrypted_payload,
        },
      })
    )

    // Sender is excluded from relay broadcast; add local echo.
    const localMessage: EphemeralChatMessage = {
      id: `${sentAt}:${fromUserId}:local`,
      signing_pubkey: signingPubkey,
      chat_id: chatId,
      from_user_id: fromUserId,
      text: trimmed,
      sent_at: sentAt,
      local_only: true,
    }
    setMessagesByBucket((prev) => appendMessage(prev, signingPubkey, chatId, localMessage))
  }

  const value = useMemo(
    () => ({
      getMessages,
      sendMessage,
    }),
    [messagesByBucket]
  )

  return <EphemeralMessagesContext.Provider value={value}>{children}</EphemeralMessagesContext.Provider>
}

export function useEphemeralMessages() {
  const ctx = useContext(EphemeralMessagesContext)
  if (!ctx) throw new Error('useEphemeralMessages must be used within an EphemeralMessagesProvider')
  return ctx
}
