import { memo } from 'react'
import { Plus, Minus } from 'lucide-react'
import { Button } from '../ui/button'
import { Tooltip } from '../Tooltip'
import type { Server } from '../../lib/tauri'
import type { PresenceLevel } from '../../contexts/PresenceContext'

function PresenceSquare({ level }: { level: PresenceLevel }) {
  const cls =
    level === 'in_call'
      ? 'bg-accent'
      : level === 'active'
        ? 'bg-success'
        : level === 'online'
          ? 'bg-warning'
          : 'bg-muted-foreground'
  return <div className={`h-2 w-2 ${cls} ring-2 ring-background`} />
}

interface ServerMembersSidebarProps {
  server: Server
  remoteProfiles: {
    getProfile: (userId: string) => any
  }
  voicePresence: {
    isUserInVoice: (signingPubkey: string, userId: string) => boolean
  }
  getMemberLevel: (signingPubkey: string, userId: string, isInVoice: boolean) => PresenceLevel
  avatarStyleForUser: (userId: string) => React.CSSProperties
  getInitials: (name: string) => string
  onMemberClick: (userId: string, element: HTMLElement) => void
  showInviteCodePopover: boolean
  setShowInviteCodePopover: (show: boolean) => void
  inviteCodeButtonRef: React.RefObject<HTMLButtonElement>
  setInviteCodeButtonRect: (rect: DOMRect | null) => void
  setRevealInviteCode: (reveal: boolean) => void
}

function ServerMembersSidebarImpl({
  server,
  remoteProfiles,
  voicePresence,
  getMemberLevel,
  avatarStyleForUser,
  getInitials,
  onMemberClick,
  showInviteCodePopover,
  setShowInviteCodePopover,
  inviteCodeButtonRef,
  setInviteCodeButtonRect,
  setRevealInviteCode,
}: ServerMembersSidebarProps) {
  const members = server.members ?? []

  return (
    <div className="w-[12.25rem] shrink-0 border-l-2 border-border bg-card/50 flex flex-col">
      <div className="p-4 pt-5 space-y-2 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between shrink-0 h-8">
          <h2 className="text-xs font-light tracking-wider uppercase text-muted-foreground px-2 leading-none">
            Members — {members.length}
          </h2>
          <div>
            <Tooltip content={showInviteCodePopover ? 'Close invite code' : 'Invite code'} side="left">
              <Button
                ref={inviteCodeButtonRef}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (showInviteCodePopover) {
                    setShowInviteCodePopover(false)
                    setRevealInviteCode(false)
                    setInviteCodeButtonRect(null)
                  } else {
                    const rect = inviteCodeButtonRef.current?.getBoundingClientRect()
                    setInviteCodeButtonRect(rect ?? null)
                    setShowInviteCodePopover(true)
                  }
                }}
              >
                {showInviteCodePopover ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="space-y-0.5">
          {members.map((member) => {
            const rp = remoteProfiles.getProfile(member.user_id)
            const displayName = member.display_name
            const level = getMemberLevel(
              server.signing_pubkey,
              member.user_id,
              voicePresence.isUserInVoice(server.signing_pubkey, member.user_id)
            )
            return (
              <button
                key={member.user_id}
                type="button"
                className="flex gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors w-full text-left min-w-0 overflow-visible"
                onClick={(e) => onMemberClick(member.user_id, e.currentTarget)}
              >
                <div
                  className="relative h-7 w-7 shrink-0 grid place-items-center rounded-none ring-2 ring-background will-change-transform transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.06] overflow-visible"
                  style={!rp?.avatar_data_url ? avatarStyleForUser(member.user_id) : undefined}
                >
                  {rp?.avatar_data_url ? (
                    <img src={rp.avatar_data_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] font-mono tracking-wider">{getInitials(displayName)}</span>
                  )}
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                    <PresenceSquare level={level} />
                  </div>
                </div>
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <p className="text-xs font-light truncate">{displayName}</p>
                  {rp?.show_secondary && rp.secondary_name ? (
                    <p className="text-[11px] text-muted-foreground truncate">{rp.secondary_name}</p>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export const ServerMembersSidebar = memo(ServerMembersSidebarImpl)
