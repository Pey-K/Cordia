import { type CSSProperties, type ReactNode } from 'react'

export function NotDownloadedCardByWidth({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  threshold: _,
  className,
  style,
  narrowContent,
  wideContent,
}: {
  threshold: number
  className?: string
  style?: CSSProperties
  narrowContent: ReactNode
  wideContent: ReactNode
}) {
  // CSS container query replaces ResizeObserver + offsetWidth forced-layout.
  // .ndcbw-narrow is shown below the threshold; .ndcbw-wide is shown at/above.
  return (
    <div className={className} style={{ ...style, containerType: 'inline-size' }}>
      <div style={{ display: 'none' }} className="ndcbw-narrow">{narrowContent}</div>
      <div className="ndcbw-wide">{wideContent}</div>
    </div>
  )
}
