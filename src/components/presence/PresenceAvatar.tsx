import { type CSSProperties } from 'react'
import { PresenceDot, type PresenceLevel } from './PresenceDot'
import { cn } from '../../lib/utils'

type PresenceAvatarProps = {
  avatarDataUrl: string | null
  displayName: string
  initials: string
  fallbackColorStyle?: CSSProperties
  presenceLevel?: PresenceLevel
  size?: 'default' | 'small'
  className?: string
  onClick?: (e: React.MouseEvent) => void
  isSpeaking?: boolean
  /** For semantic accessibility */
  'aria-label'?: string
}

export function PresenceAvatar({
  avatarDataUrl,
  displayName,
  initials,
  fallbackColorStyle,
  presenceLevel,
  size = 'default',
  className,
  onClick,
  isSpeaking,
  'aria-label': ariaLabel,
}: PresenceAvatarProps) {
  const sizeClass = size === 'small' ? 'h-6 w-6' : 'h-7 w-7'
  const textClass = size === 'small' ? 'text-[9px]' : 'text-[9px]'

  return (
    <button
      type="button"
      className={cn(
        'relative shrink-0 grid place-items-center rounded-none ring-2 will-change-transform transition-all duration-normal ease-out-smooth hover:-translate-y-0.5 hover:scale-[1.06] focus:outline-none overflow-visible',
        isSpeaking ? 'ring-presence-active' : 'ring-background',
        sizeClass,
        className
      )}
      style={!avatarDataUrl ? fallbackColorStyle : undefined}
      onClick={onClick}
      aria-label={ariaLabel ?? displayName}
    >
      {avatarDataUrl ? (
        <img src={avatarDataUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={cn('font-mono tracking-wider', textClass)}>{initials}</span>
      )}
      {presenceLevel != null && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2">
          <PresenceDot level={presenceLevel} size={size === 'small' ? 'small' : 'default'} />
        </div>
      )}
    </button>
  )
}
