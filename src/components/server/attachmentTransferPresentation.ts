import type { AttachmentTransferState, TransferHistoryEntry } from '../../contexts/EphemeralMessagesContext'
import type { EphemeralAttachmentMeta } from '../../contexts/EphemeralMessagesContext'

interface SharedAttachmentItem {
  attachment_id: string
  can_share_now?: boolean
  file_path?: string | null
  thumbnail_path?: string | null
  sha256?: string
}

interface UnsharedRecord {
  file_path?: string | null
  thumbnail_path?: string | null
}

export function buildAttachmentTransferPresentation({
  att,
  isOwn,
  attachmentTransferRows,
  transferHistory,
  sharedAttachments,
  sharedByAttachmentId,
  completedDownloadPathByAttachmentId,
  unsharedAttachmentRecords,
  hasAccessibleCompletedDownload,
  getCachedPathForSha,
}: {
  att: EphemeralAttachmentMeta
  isOwn: boolean
  attachmentTransferRows: AttachmentTransferState[]
  transferHistory: TransferHistoryEntry[]
  sharedAttachments: SharedAttachmentItem[]
  sharedByAttachmentId?: Record<string, SharedAttachmentItem | undefined>
  completedDownloadPathByAttachmentId?: Record<string, string | undefined>
  unsharedAttachmentRecords: Record<string, UnsharedRecord | null | undefined>
  hasAccessibleCompletedDownload: (id: string | null | undefined) => boolean
  getCachedPathForSha: (sha: string | undefined) => string | null
}) {
  const sharedItem = sharedByAttachmentId
    ? sharedByAttachmentId[att.attachment_id]
    : sharedAttachments.find((s) => s.attachment_id === att.attachment_id)
  const unsharedRec = unsharedAttachmentRecords[att.attachment_id]
  const completedDownloadPath = completedDownloadPathByAttachmentId
    ? completedDownloadPathByAttachmentId[att.attachment_id]
    : transferHistory.find(
        (h) =>
          h.direction === 'download' &&
          h.attachment_id === att.attachment_id &&
          h.status === 'completed' &&
          h.saved_path
      )?.saved_path
  const liveDownload = attachmentTransferRows.find(
    (t) =>
      t.direction === 'download' &&
      t.attachment_id === att.attachment_id &&
      (t.status === 'transferring' || t.status === 'requesting' || t.status === 'connecting')
  )
  const hasPath = isOwn
    ? (sharedItem?.file_path ?? unsharedRec?.file_path ?? getCachedPathForSha(att.sha256) ?? att.preview_path ?? undefined)
    : (completedDownloadPath ?? getCachedPathForSha(att.sha256) ?? undefined)
  const thumbPath = isOwn
    ? (sharedItem?.thumbnail_path ?? unsharedRec?.thumbnail_path ?? undefined)
    : undefined
  const notDownloaded = !isOwn && !hasAccessibleCompletedDownload(att.attachment_id) && !hasPath
  const downloadProgress = liveDownload
    ? Math.max(0, Math.min(100, Math.round((liveDownload.progress ?? 0) * 100)))
    : 0
  const showDownloadProgress =
    !!liveDownload && (liveDownload.status === 'transferring' || liveDownload.status === 'completed')
  return {
    sharedItem,
    hasPath,
    thumbPath,
    notDownloaded,
    liveDownload,
    downloadProgress,
    showDownloadProgress,
  }
}
