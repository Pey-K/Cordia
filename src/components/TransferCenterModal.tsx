import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowUpDown, FolderOpen, Trash2 } from 'lucide-react'
import { useWindowSize } from '../lib/useWindowSize'
import { Button } from './ui/button'
import { useTransferCenterModal } from '../contexts/TransferCenterModalContext'
import { useEphemeralMessages } from '../contexts/EphemeralMessagesContext'
import { openPathInFileExplorer } from '../lib/tauri'

function directoryForPath(path: string): string {
  const normalized = path.replace(/\//g, '\\')
  const idx = normalized.lastIndexOf('\\')
  return idx > 0 ? normalized.slice(0, idx) : normalized
}

export function TransferCenterModal() {
  const { isOpen, anchorRect, closeTransferCenter } = useTransferCenterModal()
  const { width, height } = useWindowSize()
  const isSmall = width < 700
  const {
    transferHistory,
    attachmentTransfers,
    sharedAttachments,
    refreshSharedAttachments,
    unshareAttachmentById,
  } = useEphemeralMessages()

  useEffect(() => {
    if (!isOpen) return
    refreshSharedAttachments().catch(() => {})
  }, [isOpen, refreshSharedAttachments])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTransferCenter()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, closeTransferCenter])

  const downloadRows = useMemo(
    () =>
      transferHistory
        .filter((h) => h.direction === 'download')
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
    [transferHistory]
  )

  const latestUploadByAttachment = useMemo(() => {
    const map = new Map<string, { status: string; progress: number }>()
    for (const t of attachmentTransfers) {
      if (t.direction !== 'upload') continue
      map.set(t.attachment_id, {
        status: t.status,
        progress: t.progress,
      })
    }
    return map
  }, [attachmentTransfers])

  const latestUploadHistoryByAttachment = useMemo(() => {
    const map = new Map<string, { peer: string; at: string }>()
    for (const h of transferHistory) {
      if (h.direction !== 'upload') continue
      if (!map.has(h.attachment_id)) {
        map.set(h.attachment_id, { peer: h.to_user_id || h.from_user_id, at: h.updated_at })
      }
    }
    return map
  }, [transferHistory])

  if (!isOpen || !anchorRect) return null

  const popupWidth = Math.min(isSmall ? 520 : 860, width - 24)
  const popupHeight = Math.min(isSmall ? 420 : 520, height - 24)
  const gutter = 10

  // Anchor to the button; prefer below-right alignment.
  let left = Math.round(anchorRect.right - popupWidth)
  left = Math.max(gutter, Math.min(left, width - popupWidth - gutter))
  let top = Math.round(anchorRect.bottom + 8)
  if (top + popupHeight > height - gutter) {
    top = Math.round(anchorRect.top - popupHeight - 8)
  }
  top = Math.max(gutter, Math.min(top, height - popupHeight - gutter))

  const popupEl = (
    <div className="fixed inset-0 z-[70]">
      {/* Transparent click-catcher (no dim) */}
      <div className="absolute inset-0" onMouseDown={closeTransferCenter} />
      <div
        className="absolute border-2 border-border bg-card/95 shadow-2xl flex flex-col overflow-hidden rounded-none"
        style={{ left, top, width: popupWidth, height: popupHeight }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="h-10 shrink-0 border-b border-border/70 px-2 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 mr-2"
            title="Close transfer center"
            onClick={closeTransferCenter}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <ArrowUpDown className="h-4 w-4 mr-2" />
          <h1 className="text-xs font-light tracking-wider uppercase">Transfers</h1>
        </header>

        <div className="flex-1 min-h-0 p-2">
          <div className="flex h-full min-h-0">
            <section className="flex-1 min-w-0 min-h-0 flex flex-col pr-2">
              <div className="px-1 pb-1">
                <h2 className="text-[11px] tracking-wider uppercase text-muted-foreground">Downloads</h2>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1">
                {downloadRows.length === 0 && (
                  <p className="text-[11px] text-muted-foreground px-1">No downloads yet.</p>
                )}
                {downloadRows.map((row) => (
                  <div key={row.request_id} className="border border-border/50 bg-card/60 px-2 py-1.5 space-y-1">
                    <div className="text-[12px] truncate">{row.file_name}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-2">
                      <span className="truncate">
                        {row.from_user_id.slice(0, 8)} • {(row.size_bytes ?? 0) > 0 ? `${((row.size_bytes ?? 0) / 1024).toFixed(1)} KB` : 'size ?'}
                      </span>
                      <span className="shrink-0">
                        {row.status === 'transferring' ? `${Math.round(row.progress * 100)}%` : row.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {new Date(row.updated_at).toLocaleString()}
                    </div>
                    {row.saved_path && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => openPathInFileExplorer(directoryForPath(row.saved_path!))}
                        title={row.saved_path}
                      >
                        <FolderOpen className="h-3.5 w-3.5 mr-1" />
                        Open folder
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <div className="w-px bg-foreground/15 mx-2" />

            <section className="flex-1 min-w-0 min-h-0 flex flex-col pl-2">
              <div className="px-1 pb-1">
                <h2 className="text-[11px] tracking-wider uppercase text-muted-foreground">Uploads</h2>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1">
                {sharedAttachments.length === 0 && (
                  <p className="text-[11px] text-muted-foreground px-1">No shared files.</p>
                )}
                {sharedAttachments.map((item) => {
                  const live = latestUploadByAttachment.get(item.attachment_id)
                  const latest = latestUploadHistoryByAttachment.get(item.attachment_id)
                  return (
                    <div key={item.attachment_id} className="border border-border/50 bg-card/60 px-2 py-1.5 space-y-1">
                      <div className="text-[12px] truncate">{item.file_name}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-2">
                        <span className="truncate">
                          {(item.size_bytes / 1024).toFixed(1)} KB • {item.storage_mode === 'program_copy' ? 'Cordia copy' : 'path'}
                        </span>
                        <span className="shrink-0">
                          {live
                            ? (live.status === 'transferring' ? `${Math.round(live.progress * 100)}%` : live.status)
                            : (item.can_share_now ? 'ready' : 'missing')}
                        </span>
                      </div>
                      {latest && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          Last {latest.peer.slice(0, 8)} • {new Date(latest.at).toLocaleString()}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground truncate">
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px] text-red-300 hover:text-red-200"
                        onClick={() => unshareAttachmentById(item.attachment_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remove from sharing
                      </Button>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(popupEl, document.body)
}

