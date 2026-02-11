export interface MessageStorageSettings {
  retention_hours: number
  max_messages_per_chat: number
  max_total_messages: number
  max_storage_mb: number
  max_sync_kb: number
}

export const DEFAULT_MESSAGE_STORAGE_SETTINGS: MessageStorageSettings = {
  retention_hours: 72,        // 3 days
  max_messages_per_chat: 500,
  max_total_messages: 5000,
  max_storage_mb: 16,
  max_sync_kb: 256,
}

const KEY_PREFIX = 'cordia:message-storage-settings'

function keyFor(accountId: string | null): string {
  return accountId ? `${KEY_PREFIX}:${accountId}` : KEY_PREFIX
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

export function normalizeMessageStorageSettings(
  value: Partial<MessageStorageSettings> | null | undefined
): MessageStorageSettings {
  if (!value) return { ...DEFAULT_MESSAGE_STORAGE_SETTINGS }
  return {
    retention_hours: clampInt(value.retention_hours ?? DEFAULT_MESSAGE_STORAGE_SETTINGS.retention_hours, 1, 24 * 365),
    max_messages_per_chat: clampInt(value.max_messages_per_chat ?? DEFAULT_MESSAGE_STORAGE_SETTINGS.max_messages_per_chat, 20, 20000),
    max_total_messages: clampInt(value.max_total_messages ?? DEFAULT_MESSAGE_STORAGE_SETTINGS.max_total_messages, 100, 100000),
    max_storage_mb: clampInt(value.max_storage_mb ?? DEFAULT_MESSAGE_STORAGE_SETTINGS.max_storage_mb, 1, 512),
    max_sync_kb: clampInt(value.max_sync_kb ?? DEFAULT_MESSAGE_STORAGE_SETTINGS.max_sync_kb, 32, 4096),
  }
}

export function getMessageStorageSettings(accountId: string | null): MessageStorageSettings {
  try {
    const raw = window.localStorage.getItem(keyFor(accountId))
    if (!raw) return { ...DEFAULT_MESSAGE_STORAGE_SETTINGS }
    return normalizeMessageStorageSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_MESSAGE_STORAGE_SETTINGS }
  }
}

export function setMessageStorageSettings(
  accountId: string | null,
  value: Partial<MessageStorageSettings>
): MessageStorageSettings {
  const next = normalizeMessageStorageSettings(value)
  try {
    window.localStorage.setItem(keyFor(accountId), JSON.stringify(next))
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new CustomEvent('cordia:message-storage-settings-changed', { detail: next }))
  return next
}

