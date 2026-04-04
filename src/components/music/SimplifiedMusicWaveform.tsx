import { useMemo, memo } from 'react'
import type { SplitPeaks } from './musicWaveformShared'

export interface SimplifiedMusicWaveformProps {
  peaks: SplitPeaks
  progress: number
  waveHeight?: number
  barWidth?: number
  barGap?: number
  borderRadius?: number
}

/** 
 * A high-performance, iMessage-style waveform that uses simple DOM elements.
 * Much cheaper than Canvas for large numbers of instances in a virtualized list.
 */
export const SimplifiedMusicWaveform = memo(({
  peaks,
  progress,
  waveHeight = 32,
  barWidth = 3,
  barGap = 2,
  borderRadius = 4,
}: SimplifiedMusicWaveformProps) => {
  // We want ~35-40 bars total for the iMessage look.
  // The raw peaks are 100 bars.
  const targetBarCount = 35
  
  const displayBars = useMemo(() => {
    const rawLen = peaks.top.length
    if (rawLen === 0) return []
    
    const sampled: { top: number; bottom: number }[] = []
    const step = rawLen / targetBarCount
    
    for (let i = 0; i < targetBarCount; i++) {
        const index = Math.floor(i * step)
        sampled.push({
            top: peaks.top[index] ?? 0.1,
            bottom: peaks.bottom[index] ?? 0.05
        })
    }
    return sampled
  }, [peaks])

  return (
    <div 
      className="flex items-center gap-[var(--bar-gap)] w-full h-full relative"
      style={{ 
        height: `${waveHeight}px`,
        '--bar-gap': `${barGap}px`
      } as any}
    >
      {displayBars.map((bar, i) => {
        const barProgress = i / targetBarCount
        const isActive = barProgress <= progress
        const topH = Math.max(2, bar.top * (waveHeight / 2))
        const bottomH = Math.max(2, bar.bottom * (waveHeight / 2))
        
        return (
          <div 
            key={i}
            className="flex flex-col items-center justify-center"
            style={{ width: `${barWidth}px`, height: '100%' }}
          >
            {/* Top half */}
            <div 
              style={{
                width: '100%',
                height: `${topH}px`,
                backgroundColor: isActive ? 'var(--primary)' : 'var(--foreground)',
                opacity: isActive ? 1 : 0.25,
                borderRadius: `${borderRadius}px ${borderRadius}px 0 0`,
                transition: 'background-color 0.1s ease, opacity 0.1s ease',
                marginBottom: '1px'
              }}
            />
            {/* Bottom half */}
            <div 
              style={{
                width: '100%',
                height: `${bottomH}px`,
                backgroundColor: isActive ? 'var(--primary)' : 'var(--foreground)',
                opacity: isActive ? 0.6 : 0.15,
                borderRadius: `0 0 ${borderRadius}px ${borderRadius}px`,
                transition: 'background-color 0.1s ease, opacity 0.1s ease'
              }}
            />
          </div>
        )
      })}
    </div>
  )
})
