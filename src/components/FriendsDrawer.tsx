import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from 'react'
import { Bell, Users } from 'lucide-react'

const DRAWER_CLOSED_WIDTH = 48 // px - matches PFP strip
const DRAWER_OPEN_WIDTH = 188 // 11.75rem
const HOVER_OPEN_DELAY_MS = 120
const RESIZE_SUPPRESS_MS = 250

type Props = {
  stripHeader?: ReactNode
  stripContent: ReactNode
  children: ReactNode
  /** When true, drawer stays open on mouse leave (e.g. invite popup is open) */
  stayOpen?: boolean
  /** Increment to force-close drawer (e.g. when popover closed by click-outside) */
  closeDrawerTrigger?: number
}

type StripFriend = {
  userId: string
  displayName: string
  avatarDataUrl: string | null
  bestLevel?: 'in_call' | 'active' | 'online' | 'offline'
}

type DrawerPanelProps = {
  friendsPaneMode: 'friends' | 'pending'
  pendingOutgoingCount: number
  mergedIncomingCount: number
  stripFriends: StripFriend[]
  stripPending: StripFriend[]
  getInitials: (name: string) => string
  avatarStyleForUser: (userId: string) => CSSProperties
  onAvatarClick: (userId: string, rect: DOMRect) => void
  onToggleMode: () => void
  /** When true, drawer stays open (e.g. invite/friend code popup is open) */
  popoverOpen?: boolean
  /** Increment to force-close drawer when popover closed by click-outside */
  closeDrawerTrigger?: number
  children: ReactNode
}

/**
 * CS2-style friends list drawer: narrow strip of PFPs when closed,
 * expands to full pane on hover. Used when window width < 605px.
 */
export function FriendsDrawer({ stripHeader, stripContent, children, stayOpen = false, closeDrawerTrigger }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [suppressHover, setSuppressHover] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 0)

  // Suppress hover-open briefly after window resize (prevents jitter when resizing from right edge)
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      if (w !== lastWidthRef.current) {
        lastWidthRef.current = w
        setSuppressHover(true)
        setTimeout(() => setSuppressHover(false), RESIZE_SUPPRESS_MS)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    }
  }, [])

  // When popover is closed by click-outside (outside drawer), close drawer since mouse left
  useEffect(() => {
    if (closeDrawerTrigger != null && closeDrawerTrigger > 0) {
      setIsOpen(false)
    }
  }, [closeDrawerTrigger])

  const handleMouseEnter = () => {
    if (suppressHover) return
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    hoverTimeoutRef.current = setTimeout(() => {
      hoverTimeoutRef.current = null
      setIsOpen(true)
    }, HOVER_OPEN_DELAY_MS)
  }

  const handleMouseLeave = () => {
    if (stayOpen) return
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsOpen(false)
  }

  return (
    <div
      data-friends-drawer
      className="absolute right-0 top-8 bottom-8 flex shrink-0 z-20 overflow-visible"
      style={{
        width: isOpen ? DRAWER_OPEN_WIDTH : DRAWER_CLOSED_WIDTH,
        transition: 'width 0.2s ease-out',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="h-full w-full border-2 border-border bg-card/80 backdrop-blur-sm rounded-lg flex flex-col min-h-0 overflow-visible relative">
        {/* Strip (closed state) - crossfades with full content */}
        <div
          className={`absolute inset-0 flex flex-col items-center py-3 gap-2 transition-opacity duration-150 overflow-visible ${
            isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          {stripHeader ? (
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              {stripHeader}
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-2 min-h-0 flex-1 justify-start pt-1.5 px-1 overflow-y-auto w-full">
            {stripContent}
          </div>
        </div>
        {/* Full content (open state) - match closed strip spacing without hard pinning */}
        <div
          className={`flex-1 min-h-0 flex flex-col overflow-visible pt-3 px-4 pb-4 transition-opacity duration-150
          [&_h3]:text-foreground/60
          [&>div:nth-child(2)]:!mt-2 [&>div:nth-child(2)]:pt-1.5 [&>div:nth-child(2)]:pb-1 ${
            isOpen ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none absolute inset-0'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export function FriendsDrawerPanel({
  friendsPaneMode,
  pendingOutgoingCount,
  mergedIncomingCount,
  stripFriends,
  stripPending,
  getInitials,
  avatarStyleForUser,
  onAvatarClick,
  onToggleMode,
  popoverOpen = false,
  closeDrawerTrigger,
  children,
}: DrawerPanelProps) {
  const isFriends = friendsPaneMode === 'friends'
  const list = isFriends ? stripFriends : stripPending

  return (
    <FriendsDrawer
      stayOpen={popoverOpen}
      closeDrawerTrigger={closeDrawerTrigger}
      stripHeader={
        <button
          type="button"
          className="relative h-8 w-8 grid place-items-center rounded-none hover:bg-accent/30"
          onClick={onToggleMode}
          title={isFriends ? 'Pending invites' : 'Back to friends'}
        >
          {isFriends ? (
            <>
              <Bell className="h-4 w-4" />
              {pendingOutgoingCount > 0 && (
                <span
                  className="absolute -top-0.5 left-0.5 min-w-[0.75rem] h-3.5 px-0.5 flex items-center justify-center rounded-sm bg-gray-500 text-black border border-border text-[8px] font-medium leading-none pointer-events-none"
                  title={`${pendingOutgoingCount} outgoing`}
                >
                  {pendingOutgoingCount > 99 ? '99+' : pendingOutgoingCount}
                </span>
              )}
              {mergedIncomingCount > 0 && (
                <span
                  className="absolute -top-0.5 right-0.5 min-w-[0.75rem] h-3.5 px-0.5 flex items-center justify-center rounded-sm bg-green-500 text-white border border-border text-[8px] font-medium leading-none pointer-events-none"
                  title={`${mergedIncomingCount} incoming`}
                >
                  {mergedIncomingCount > 99 ? '99+' : mergedIncomingCount}
                </span>
              )}
            </>
          ) : (
            <Users className="h-4 w-4" />
          )}
        </button>
      }
      stripContent={
        <div className="flex flex-col items-center gap-2 min-h-0 flex-1">
          {isFriends ? (() => {
            const offlineIdx = list.findIndex((f) => f.bestLevel === 'offline')
            const hasOfflineSep = offlineIdx > 0 && offlineIdx < list.length
            const online = hasOfflineSep ? list.slice(0, offlineIdx) : list
            const offline = hasOfflineSep ? list.slice(offlineIdx) : []
            const renderPfp = ({ userId, displayName, avatarDataUrl, bestLevel }: { userId: string; displayName: string; avatarDataUrl: string | null; bestLevel?: string }) => (
              <button
                key={userId}
                type="button"
                className="relative h-7 w-7 shrink-0 grid place-items-center rounded-none ring-2 ring-background"
                style={!avatarDataUrl ? avatarStyleForUser(userId) : undefined}
                onClick={(e) => onAvatarClick(userId, (e.currentTarget as HTMLElement).getBoundingClientRect())}
                aria-label={displayName}
              >
                {avatarDataUrl ? (
                  <img src={avatarDataUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[9px] font-mono tracking-wider">{getInitials(displayName)}</span>
                )}
                {bestLevel ? (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2">
                    {bestLevel === 'in_call' ? (
                      <div className="h-2 w-2 bg-blue-500 ring-2 ring-background" />
                    ) : bestLevel === 'active' ? (
                      <div className="h-2 w-2 bg-green-500 ring-2 ring-background" />
                    ) : bestLevel === 'online' ? (
                      <div className="h-2 w-2 bg-amber-500 ring-2 ring-background" />
                    ) : (
                      <div className="h-2 w-2 bg-muted-foreground ring-2 ring-background" />
                    )}
                  </div>
                ) : null}
              </button>
            )
            return (
              <>
                {online.map((f) => renderPfp(f))}
                {hasOfflineSep && (
                  <div className="w-full flex items-center justify-center py-0.5" aria-hidden>
                    <div className="h-px flex-1 max-w-[80%] bg-muted-foreground/60" />
                  </div>
                )}
                {offline.map((f) => renderPfp(f))}
              </>
            )
          })() : list.map(({ userId, displayName, avatarDataUrl }) => (
            <button
              key={userId}
              type="button"
              className="relative h-7 w-7 shrink-0 grid place-items-center rounded-none ring-2 ring-background"
              style={!avatarDataUrl ? avatarStyleForUser(userId) : undefined}
              onClick={(e) => onAvatarClick(userId, (e.currentTarget as HTMLElement).getBoundingClientRect())}
              aria-label={displayName}
            >
              {avatarDataUrl ? (
                <img src={avatarDataUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[9px] font-mono tracking-wider">{getInitials(displayName)}</span>
              )}
            </button>
          ))}
        </div>
      }
    >
      {children}
    </FriendsDrawer>
  )
}
