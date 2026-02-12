export interface DownloadSettings {
  preferred_dir: string | null
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  preferred_dir: null,
}

const KEY_PREFIX = 'cordia:download-settings'

function keyFor(accountId: string | null): string {
  return accountId ? `${KEY_PREFIX}:${accountId}` : KEY_PREFIX
}

export function normalizeDownloadSettings(
  value: Partial<DownloadSettings> | null | undefined
): DownloadSettings {
  if (!value) return { ...DEFAULT_DOWNLOAD_SETTINGS }
  const preferred = typeof value.preferred_dir === 'string' ? value.preferred_dir.trim() : null
  return {
    preferred_dir: preferred && preferred.length > 0 ? preferred : null,
  }
}

export function getDownloadSettings(accountId: string | null): DownloadSettings {
  try {
    const raw = window.localStorage.getItem(keyFor(accountId))
    if (!raw) return { ...DEFAULT_DOWNLOAD_SETTINGS }
    return normalizeDownloadSettings(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_DOWNLOAD_SETTINGS }
  }
}

export function setDownloadSettings(
  accountId: string | null,
  value: Partial<DownloadSettings>
): DownloadSettings {
  const next = normalizeDownloadSettings(value)
  try {
    window.localStorage.setItem(keyFor(accountId), JSON.stringify(next))
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new CustomEvent('cordia:download-settings-changed', { detail: next }))
  return next
}

