import React, { memo, useMemo, type ComponentProps, type MutableRefObject, type RefObject } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { MessageBubble } from '../MessageBubble'
import { ServerMessageContent } from './ServerMessageContent'
import type { EphemeralChatMessage } from '../../contexts/EphemeralMessagesContext'
import type { AttachmentTransferState, TransferHistoryEntry } from '../../contexts/EphemeralMessagesContext'
import type { PresenceLevel } from '../../contexts/PresenceContext'
import type { Server } from '../../lib/tauri'

type ChatItem =
  | { type: 'day'; dateStr: string }
  | { type: 'group'; userId: string; messages: EphemeralChatMessage[] }

interface ServerMessageRowProps {
  msg: EphemeralChatMessage
  isFirstInGroup: boolean
  displayName: string
  levelColor: string
  hovered: boolean
  onHoverChange: (hovered: boolean) => void
  currentUserId: string | undefined
  lastDeliveredMessageId: string | null
  lastPendingMessageId: string | null
  ctx: Record<string, unknown>
}
const ServerMessageRow = memo(function ServerMessageRow({
  msg,
  isFirstInGroup,
  displayName,
  levelColor,
  hovered,
  onHoverChange,
  currentUserId,
  lastDeliveredMessageId,
  lastPendingMessageId,
  ctx,
}: ServerMessageRowProps) {
  return (
    <MessageBubble
      msg={msg}
      isFirstInGroup={isFirstInGroup}
      displayName={displayName}
      levelColor={levelColor}
      hovered={hovered}
      onHoverChange={onHoverChange}
      currentUserId={currentUserId}
      lastDeliveredMessageId={lastDeliveredMessageId}
      lastPendingMessageId={lastPendingMessageId}
    >
      <ServerMessageContent msg={msg} ctx={ctx} />
    </MessageBubble>
  )
})

function PresenceSquare({ level, size = 'default' }: { level: PresenceLevel; size?: 'default' | 'small' }) {
  const cls =
    level === 'in_call'
      ? 'bg-blue-500'
      : level === 'active'
        ? 'bg-green-500'
        : level === 'online'
          ? 'bg-amber-500'
          : 'bg-muted-foreground'
  const sizeClass = size === 'small' ? 'h-1.5 w-1.5' : 'h-2 w-2'
  return <div className={`${sizeClass} ${cls} ring-2 ring-background`} />
}

interface SharedAttachmentItem {
  attachment_id: string
  can_share_now?: boolean
  file_path?: string | null
  thumbnail_path?: string | null
  sha256?: string
}

export interface ServerChatTimelineProps {
  virtuosoKey: string
  chatItems: ChatItem[]
  virtuosoRef: RefObject<VirtuosoHandle | null>
  VirtuosoScroller: React.ForwardRefExoticComponent<
    ComponentProps<'div'> & React.RefAttributes<HTMLDivElement>
  >
  server: Server
  groupChat: { id: string }
  identity: { user_id: string; display_name?: string } | null
  profile: { avatar_data_url?: string | null }
  getProfile: (userId: string) => { avatar_data_url?: string | null } | null | undefined
  getMemberLevel: (signingPubkey: string, userId: string, isInVoiceForUser: boolean) => PresenceLevel
  isUserInVoice: (userId: string) => boolean
  fallbackNameForUser: (userId: string) => string
  getInitials: (name: string) => string
  avatarStyleForUser: (userId: string) => React.CSSProperties
  onProfileClick: (userId: string, element: HTMLElement) => void
  hoveredMsgId: string | null
  setHoveredMsgId: (id: string | null) => void
  lastDeliveredMessageId: string | null
  lastPendingMessageId: string | null
  attachmentTransfers: AttachmentTransferState[]
  transferHistory: TransferHistoryEntry[]
  sharedAttachments: SharedAttachmentItem[]
  hasAccessibleCompletedDownload: (attachmentId: string | null | undefined) => boolean
  getCachedPathForSha: (sha256: string | undefined) => string | null
  getLevel: (signingPubkey: string, userId: string, isInCall?: boolean) => PresenceLevel
  unsharedAttachmentRecords: Record<string, { file_path?: string | null; thumbnail_path?: string | null } | null | undefined>
  revealedSpoilerIds: Set<string>
  setRevealedSpoilerIds: (fn: (prev: Set<string>) => Set<string>) => void
  updateAttachmentAspect: (
    signingPubkey: string,
    chatId: string,
    messageId: string,
    attachmentId: string,
    aspect: { w: number; h: number }
  ) => void
  requestAttachmentDownload: (msg: EphemeralChatMessage, attachment?: EphemeralChatMessage['attachment']) => Promise<void>
  isSharedInServer: (serverSigningPubkey: string, sha256: string) => boolean
  justSharedKeys: Set<string>
  handleShareAgainAttachment: (
    att: { attachment_id: string; file_name: string; size_bytes: number; sha256?: string },
    isOwn: boolean,
    existingPath?: string | null
  ) => Promise<void>
  setMediaPreview: (opts: { type: 'image' | 'video'; url: string; fileName: string }) => void
  inlinePlayingVideoId: string | null
  setInlinePlayingVideoId: (id: string | null) => void
  videoScrollTargetsRef: MutableRefObject<Record<string, HTMLDivElement | null>>
  setInlineVideoShowControls: (show: boolean) => void
  inlineVideoShowControls: boolean
}

function ServerChatTimelineImpl(props: ServerChatTimelineProps) {
  const {
    virtuosoKey,
    chatItems,
  virtuosoRef,
  VirtuosoScroller,
    server,
    groupChat,
    identity,
    profile,
    getProfile,
    getMemberLevel,
    isUserInVoice,
    fallbackNameForUser,
    getInitials,
    avatarStyleForUser,
    onProfileClick,
    hoveredMsgId,
    setHoveredMsgId,
    lastDeliveredMessageId,
    lastPendingMessageId,
    attachmentTransfers,
    transferHistory,
    sharedAttachments,
    hasAccessibleCompletedDownload,
    getCachedPathForSha,
    getLevel,
    unsharedAttachmentRecords,
    revealedSpoilerIds,
    setRevealedSpoilerIds,
    updateAttachmentAspect,
    requestAttachmentDownload,
    isSharedInServer,
    justSharedKeys,
    handleShareAgainAttachment,
    setMediaPreview,
    inlinePlayingVideoId,
    setInlinePlayingVideoId,
    videoScrollTargetsRef,
    setInlineVideoShowControls,
    inlineVideoShowControls,
  } = props

  const transferByMessageId = useMemo(() => {
    const byMsg: Record<string, AttachmentTransferState[]> = {}
    const attachmentToMessageIds: Record<string, Set<string>> = {}
    for (const it of chatItems) {
      if (it.type !== 'group') continue
      for (const msg of it.messages) {
        const atts = msg.attachments ?? (msg.attachment ? [msg.attachment] : [])
        for (const a of atts) {
          if (!attachmentToMessageIds[a.attachment_id]) attachmentToMessageIds[a.attachment_id] = new Set()
          attachmentToMessageIds[a.attachment_id].add(msg.id)
        }
      }
    }
    for (const t of attachmentTransfers) {
      if (!byMsg[t.message_id]) byMsg[t.message_id] = []
      byMsg[t.message_id].push(t)
      const msgIds = attachmentToMessageIds[t.attachment_id]
      if (msgIds) {
        for (const mid of msgIds) {
          if (mid === t.message_id) continue
          if (!byMsg[mid]) byMsg[mid] = []
          byMsg[mid].push(t)
        }
      }
    }
    return byMsg
  }, [chatItems, attachmentTransfers])

  const ctxByMessageId = useMemo(() => {
    const out: Record<string, Record<string, unknown>> = {}
    for (const it of chatItems) {
      if (it.type !== 'group') continue
      for (const msg of it.messages) {
        const messageAttachments = msg.attachments ?? (msg.attachment ? [msg.attachment] : [])
        const attachmentTransferRows = transferByMessageId[msg.id] ?? []
        const hostOnlineForAttachment =
          messageAttachments.length > 0
            ? getLevel(
                server.signing_pubkey,
                msg.from_user_id,
                isUserInVoice(msg.from_user_id)
              ) !== 'offline'
            : false
        const hasRejectedDownloadForAttachment = (att: { attachment_id: string }) =>
          attachmentTransferRows.some(
            (t) =>
              t.direction === 'download' &&
              t.attachment_id === att.attachment_id &&
              t.status === 'rejected'
          ) ||
          transferHistory.some(
            (h) =>
              h.direction === 'download' &&
              h.attachment_id === att.attachment_id &&
              h.status === 'rejected'
          )
        const attachmentStateLabelFor = (att: { attachment_id: string; sha256?: string }) =>
          hasAccessibleCompletedDownload(att.attachment_id) ||
          (att.sha256 ? !!getCachedPathForSha(att.sha256) : false)
            ? 'Cached'
            : msg.from_user_id === identity?.user_id
              ? sharedAttachments.some(
                  (s) => s.attachment_id === att.attachment_id && s.can_share_now
                )
                ? 'Available'
                : 'Unavailable'
              : hasRejectedDownloadForAttachment(att) || !hostOnlineForAttachment
                ? 'Unavailable'
                : 'Available'
        const attachmentStateLabel =
          messageAttachments.length === 1 ? attachmentStateLabelFor(messageAttachments[0]) : null
        const unavailableReasonFor = (a: { attachment_id: string }) => {
          if (msg.from_user_id === identity?.user_id) {
            return !sharedAttachments.some(
              (s) => s.attachment_id === a.attachment_id && s.can_share_now
            )
              ? 'No longer shared'
              : null
          }
          const removed = hasRejectedDownloadForAttachment(a)
          const offline = !hostOnlineForAttachment
          if (removed && offline) return 'Removed • Offline'
          if (removed) return 'Removed'
          if (offline) return 'Offline'
          return null
        }
        const hasActiveUploadForAttachment = (a: { attachment_id: string }) =>
          attachmentTransferRows.some(
            (t) =>
              t.direction === 'upload' &&
              t.attachment_id === a.attachment_id &&
              t.status !== 'completed' &&
              t.status !== 'failed' &&
              t.status !== 'rejected'
          )
        out[msg.id] = {
          identity,
          sharedAttachments,
          unsharedAttachmentRecords,
          transferHistory,
          attachmentTransferRows,
          getCachedPathForSha,
          hasAccessibleCompletedDownload,
          attachmentStateLabelFor,
          revealedSpoilerIds,
          setRevealedSpoilerIds,
          server,
          groupChat,
          updateAttachmentAspect,
          requestAttachmentDownload,
          unavailableReasonFor,
          isSharedInServer,
          hasActiveUploadForAttachment,
          justSharedKeys,
          handleShareAgainAttachment,
          setMediaPreview,
          inlinePlayingVideoId,
          setInlinePlayingVideoId,
          videoScrollTargetsRef,
          setInlineVideoShowControls,
          inlineVideoShowControls,
          attachmentStateLabel,
        }
      }
    }
    return out
  }, [
    chatItems,
    transferByMessageId,
    transferHistory,
    sharedAttachments,
    hasAccessibleCompletedDownload,
    getCachedPathForSha,
    getLevel,
    isUserInVoice,
    server.signing_pubkey,
    identity?.user_id,
    unsharedAttachmentRecords,
    revealedSpoilerIds,
    setRevealedSpoilerIds,
    updateAttachmentAspect,
    requestAttachmentDownload,
    isSharedInServer,
    justSharedKeys,
    handleShareAgainAttachment,
    setMediaPreview,
    inlinePlayingVideoId,
    setInlinePlayingVideoId,
    videoScrollTargetsRef,
    setInlineVideoShowControls,
    inlineVideoShowControls,
  ])

  const itemContent = useMemo(
    () =>
      function ItemContent(idx: number, item: ChatItem) {
        if (item.type === 'day') {
          return (
            <div key={`day-${idx}`} className="max-w-6xl mx-auto flex items-center gap-3 py-2" aria-hidden>
              <div className="h-px flex-1 bg-muted-foreground/50" />
              <span className="text-xs text-muted-foreground shrink-0">{item.dateStr}</span>
              <div className="h-px flex-1 bg-muted-foreground/50" />
            </div>
          )
        }
        const { userId, messages } = item
        const displayName =
          userId === identity?.user_id ? identity?.display_name ?? 'You' : fallbackNameForUser(userId)
        const rp = userId === identity?.user_id ? null : getProfile(userId)
        const avatarUrl = userId === identity?.user_id ? profile.avatar_data_url : rp?.avatar_data_url
        const memberLevel = getMemberLevel(server.signing_pubkey, userId, isUserInVoice(userId))
        const levelColor =
          memberLevel === 'in_call'
            ? 'text-blue-500'
            : memberLevel === 'active'
              ? 'text-green-500'
              : memberLevel === 'online'
                ? 'text-amber-500'
                : 'text-muted-foreground'
        return (
          <div key={`group-${idx}-${messages[0]?.id}`} className="max-w-6xl mx-auto flex gap-2 py-1">
            <div className="shrink-0 w-8 flex flex-col items-center pt-0.5 self-start sticky top-0 z-10 bg-background pb-1">
              <div className="relative overflow-visible will-change-transform transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.06]">
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 z-10">
                  <PresenceSquare level={memberLevel} />
                </div>
                <button
                  type="button"
                  className="relative h-8 w-8 grid place-items-center rounded-none ring-2 ring-background shrink-0 focus:outline-none overflow-hidden"
                  style={!avatarUrl ? avatarStyleForUser(userId) : undefined}
                  onClick={(e) => onProfileClick(userId, e.currentTarget)}
                  aria-label={displayName}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-mono tracking-wider">{getInitials(displayName)}</span>
                  )}
                </button>
              </div>
            </div>
            <div className="min-w-0 flex-1 flex flex-col">
              {messages.map((msg, msgIdx) => {
                const ctx = ctxByMessageId[msg.id]
                if (!ctx) return null
                return (
                  <ServerMessageRow
                    key={msg.id}
                    msg={msg}
                    isFirstInGroup={msgIdx === 0}
                    displayName={displayName}
                    levelColor={levelColor}
                    hovered={hoveredMsgId === msg.id}
                    onHoverChange={(hovered) => setHoveredMsgId(hovered ? msg.id : null)}
                    currentUserId={identity?.user_id}
                    lastDeliveredMessageId={lastDeliveredMessageId}
                    lastPendingMessageId={lastPendingMessageId}
                    ctx={ctx}
                  />
                )
              })}
            </div>
          </div>
        )
      },
    [
      identity,
      profile.avatar_data_url,
      getProfile,
      getMemberLevel,
      isUserInVoice,
      fallbackNameForUser,
      getInitials,
      avatarStyleForUser,
      onProfileClick,
      server.signing_pubkey,
      hoveredMsgId,
      setHoveredMsgId,
      lastDeliveredMessageId,
      lastPendingMessageId,
      ctxByMessageId,
    ]
  )

  return (
    <Virtuoso
      key={virtuosoKey}
      ref={virtuosoRef as React.RefObject<VirtuosoHandle>}
      className="p-4 pt-2"
      style={{ height: '100%' }}
      components={{ Scroller: VirtuosoScroller }}
      data={chatItems}
      alignToBottom
      followOutput="smooth"
      initialTopMostItemIndex={Math.max(chatItems.length - 1, 0)}
      itemContent={itemContent}
    />
  )
}

export const ServerChatTimeline = memo(ServerChatTimelineImpl)
