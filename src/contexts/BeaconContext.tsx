import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react'
import { checkBeacon, getBeaconUrl } from '../lib/tauri'
import { useAccount } from './AccountContext'

export type BeaconStatus = 'connected' | 'disconnected' | 'checking'

interface BeaconContextType {
  status: BeaconStatus
  beaconUrl: string
  checkHealth: () => Promise<void>
  reloadUrl: () => Promise<void>
}

const BeaconContext = createContext<BeaconContextType | null>(null)

export function BeaconProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BeaconStatus>('checking')
  const [beaconUrl, setBeaconUrl] = useState<string>('')
  const healthCheckInFlightRef = useRef(false)
  const { currentAccountId } = useAccount()

  const checkHealth = useCallback(async () => {
    if (healthCheckInFlightRef.current) return
    healthCheckInFlightRef.current = true

    setStatus('checking')
    try {
      const isHealthy = await checkBeacon(beaconUrl || undefined)
      setStatus(isHealthy ? 'connected' : 'disconnected')
    } catch (error) {
      console.error('Beacon health check failed:', error)
      setStatus('disconnected')
    } finally {
      healthCheckInFlightRef.current = false
    }
  }, [beaconUrl])

  const checkHealthSilent = useCallback(async () => {
    if (healthCheckInFlightRef.current) return
    healthCheckInFlightRef.current = true

    try {
      const isHealthy = await checkBeacon(beaconUrl || undefined)
      setStatus(prev => {
        const next: BeaconStatus = isHealthy ? 'connected' : 'disconnected'
        if (prev === 'checking') return prev
        return next
      })
    } catch (error) {
      console.error('Beacon health check failed:', error)
      setStatus(prev => (prev === 'checking' ? prev : 'disconnected'))
    } finally {
      healthCheckInFlightRef.current = false
    }
  }, [beaconUrl])

  const reloadUrl = useCallback(async () => {
    try {
      const url = await getBeaconUrl()
      setBeaconUrl(url)
    } catch (error) {
      console.error('Failed to load beacon URL:', error)
    }
  }, [])

  useEffect(() => {
    reloadUrl()
  }, [reloadUrl])

  useEffect(() => {
    if (currentAccountId) {
      reloadUrl()
    }
  }, [currentAccountId, reloadUrl])

  useEffect(() => {
    if (!beaconUrl) return

    checkHealth()

    const interval = setInterval(checkHealthSilent, 30000)

    return () => clearInterval(interval)
  }, [beaconUrl, checkHealth, checkHealthSilent])

  return (
    <BeaconContext.Provider value={{ status, beaconUrl, checkHealth, reloadUrl }}>
      {children}
    </BeaconContext.Provider>
  )
}

export function useBeacon() {
  const context = useContext(BeaconContext)
  if (!context) {
    throw new Error('useBeacon must be used within a BeaconProvider')
  }
  return context
}
