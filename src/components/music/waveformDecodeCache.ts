import {
  WAVE_BARS,
  extractSplitPeaksFromChannelData,
  type SplitPeaks,
} from './musicWaveformShared'

/** One context for all Web Audio decodes — avoids create/close churn per chat row. */
let sharedDecodeCtx: AudioContext | null = null

export function getSharedDecodeAudioContext(): AudioContext {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!sharedDecodeCtx || sharedDecodeCtx.state === 'closed') {
    sharedDecodeCtx = new AC()
  }
  return sharedDecodeCtx
}

const MAX_ENTRIES = 48
/** Same file URL → reuse peaks (scroll back in chat, multiple mounts). */
const peaksCache = new Map<string, SplitPeaks>()

type InFlightEntry = {
  promise: Promise<SplitPeaks>
  abortFetch: () => void
  subscribers: number
}

/** In-flight decode keyed by `audioSrc`; fetch is aborted when the last subscriber releases (e.g. Virtuoso unmount). */
const decodeInFlight = new Map<string, InFlightEntry>()

function clonePeaks(p: SplitPeaks): SplitPeaks {
  return { top: [...p.top], bottom: [...p.bottom] }
}

export function getCachedWaveformPeaks(audioSrc: string): SplitPeaks | null {
  const hit = peaksCache.get(audioSrc)
  return hit ? clonePeaks(hit) : null
}

export function setCachedWaveformPeaks(audioSrc: string, peaks: SplitPeaks): void {
  if (peaksCache.size >= MAX_ENTRIES && !peaksCache.has(audioSrc)) {
    const first = peaksCache.keys().next().value as string | undefined
    if (first) peaksCache.delete(first)
  }
  peaksCache.set(audioSrc, clonePeaks(peaks))
}

/**
 * Join an in-flight decode or start fetch + `decodeAudioData` for `audioSrc`.
 * Call `release()` when the consumer unmounts or abandons the decode; when the last subscriber
 * releases before completion, `fetch` is aborted so scrolling past a row does not keep reading the file.
 */
export function subscribeWaveformDecode(
  audioSrc: string,
  onDecodedSampleRate?: (sampleRate: number) => void
): { promise: Promise<SplitPeaks>; release: () => void } {
  let entry = decodeInFlight.get(audioSrc)
  if (!entry) {
    const ac = new AbortController()
    const promise = (async (): Promise<SplitPeaks> => {
      const actx = getSharedDecodeAudioContext()
      if (actx.state === 'suspended') await actx.resume()
      const res = await fetch(audioSrc, { signal: ac.signal })
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const buf = await res.arrayBuffer()
      const audioBuffer = await actx.decodeAudioData(buf.slice(0))
      onDecodedSampleRate?.(audioBuffer.sampleRate)
      const ch = audioBuffer.getChannelData(0)
      const peaks = extractSplitPeaksFromChannelData(ch, WAVE_BARS)
      setCachedWaveformPeaks(audioSrc, peaks)
      return peaks
    })().finally(() => {
      decodeInFlight.delete(audioSrc)
    })

    entry = {
      promise,
      abortFetch: () => ac.abort(),
      subscribers: 0,
    }
    decodeInFlight.set(audioSrc, entry)
  }

  entry.subscribers += 1

  let released = false
  const release = () => {
    if (released) return
    released = true
    const e = decodeInFlight.get(audioSrc)
    if (!e) return
    e.subscribers -= 1
    if (e.subscribers <= 0) {
      e.abortFetch()
    }
  }

  return { promise: entry.promise, release }
}
