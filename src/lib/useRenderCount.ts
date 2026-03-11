import { useRef } from 'react'

const __DEV__ = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false
const LOG_EVERY_N = 10

/**
 * Dev-only: track render count for a component. Use to establish baseline
 * and verify that memoization reduces rerenders (e.g. message rows).
 * In production this is a no-op.
 */
export function useRenderCount(componentName: string): void {
  const ref = useRef(0)
  if (!__DEV__) return
  ref.current += 1
  if (ref.current === 1 || ref.current % LOG_EVERY_N === 0) {
    console.log(`[render] ${componentName} #${ref.current}`)
  }
}
