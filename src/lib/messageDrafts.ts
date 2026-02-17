/** Per-server message drafts in sessionStorage. Cleared on app close or when leaving the server. */

function getDraftKey(accountId: string, signingPubkey: string): string {
  return `cordia:draft:${accountId}:${signingPubkey}`
}

export function getDraft(accountId: string, signingPubkey: string): string {
  try {
    return sessionStorage.getItem(getDraftKey(accountId, signingPubkey)) ?? ''
  } catch {
    return ''
  }
}

export function setDraft(accountId: string, signingPubkey: string, value: string): void {
  try {
    const key = getDraftKey(accountId, signingPubkey)
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // sessionStorage may throw in private mode
  }
}

export function clearDraft(accountId: string, signingPubkey: string): void {
  setDraft(accountId, signingPubkey, '')
}
