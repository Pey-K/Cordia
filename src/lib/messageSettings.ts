export type MessageStorageMode = 'persistent' | 'ephemeral'

/** When someone requests to download an attachment you shared: auto-allow or show a prompt. */
export type AttachmentDownloadAllow = 'always' | 'ask'

export interface MessageStorageSettings {
  mode: MessageStorageMode
  max_messages_on_open: number
  max_storage_mb: number
  max_sync_kb: number
  /** If 'always', allow downloads without confirmation; if 'ask', show Allow/Deny each time. */
  attachment_download_allow: AttachmentDownloadAllow
}

export interface MessageStorageSettingsChangedDetail {
  signing_pubkey: string
  settings: MessageStorageSettings
}

export const DEFAULT_MESSAGE_STORAGE_SETTINGS: MessageStorageSettings = {
  mode: 'persistent',
  max_messages_on_open: 500,
  max_storage_mb: 150,
  max_sync_kb: 256,
  attachment_download_allow: 'always',
}

const KEY_PREFIX = 'cordia:message-storage-settings'

function keyFor(accountId: string | null, signingPubkey: string): string {
  return accountId
    ? `${KEY_PREFIX}:${accountId}:${signingPubkey}`
    : `${KEY_PREFIX}:${signingPubkey}`
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.floor(value)))
}

export function normalizeMessageStorageSettings(
  value: Partial<MessageStorageSettings> | null | undefined
): MessageStorageSettings {
  if (!value) return { ...DEFAULT_MESSAGE_STORAGE_SETTINGS }
  const allow = value.attachment_download_allow
  return {
    mode: value.mode === 'ephemeral' ? 'ephemeral' : 'persistent',
    max_messages_on_open: clampInt(value.max_messages_on_open ?? (value as { max_total_messages?: number }).max_total_messages ?? DEFAULT_MESSAGE_STORAGE_SETTINGS.max_messages_on_open, 50, 5000),
    max_storage_mb: clampInt(value.max_storage_mb ?? DEFAULT_MESSAGE_STORAGE_SETTINGS.max_storage_mb, 1, 512),
    max_sync_kb: clampInt(value.max_sync_kb ?? DEFAULT_MESSAGE_STORAGE_SETTINGS.max_sync_kb, 32, 4096),
    attachment_download_allow: allow === 'ask' ? 'ask' : 'always',
  }
}

export function getMessageStorageSettings(
  accountId: string | null,
  signingPubkey: string
): MessageStorageSettings {
  if (!signingPubkey) return { ...DEFAULT_MESSAGE_STORAGE_SETTINGS }
  try {
    const raw = window.localStorage.getItem(keyFor(accountId, signingPubkey))
    if (!raw) return { ...DEFAULT_MESSAGE_STORAGE_SETTINGS }
    return normalizeMessageStorageSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_MESSAGE_STORAGE_SETTINGS }
  }
}

export function setMessageStorageSettings(
  accountId: string | null,
  signingPubkey: string,
  value: Partial<MessageStorageSettings>
): MessageStorageSettings {
  if (!signingPubkey) return { ...DEFAULT_MESSAGE_STORAGE_SETTINGS }
  const next = normalizeMessageStorageSettings(value)
  try {
    window.localStorage.setItem(keyFor(accountId, signingPubkey), JSON.stringify(next))
  } catch {
    // ignore storage failures
  }
  const detail: MessageStorageSettingsChangedDetail = { signing_pubkey: signingPubkey, settings: next }
  window.dispatchEvent(new CustomEvent('cordia:message-storage-settings-changed', { detail }))
  return next
}

