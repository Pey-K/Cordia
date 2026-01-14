import { useEffect, useMemo, useState } from 'react'
import { useSignaling } from '../contexts/SignalingContext'
import { Square } from 'lucide-react'
import { PEER_CONNECTION_CONFIG } from '../lib/webrtc'
import { useNavigate } from 'react-router-dom'
import { getNatOverride, type NatOverride } from '../lib/natOverride'

type NatIndicator = 'checking' | 'local_only' | 'nat' | 'relay' | 'unknown'

let natProbePromise: Promise<NatIndicator> | null = null

async function probeNatIndicator(): Promise<NatIndicator> {
  try {
    const pc = new RTCPeerConnection(PEER_CONNECTION_CONFIG)
    // Creating a data channel is enough to trigger ICE gathering.
    pc.createDataChannel('rmmt-nat-probe')

    const candidates: string[] = []
    pc.onicecandidate = (ev) => {
      if (ev.candidate?.candidate) candidates.push(ev.candidate.candidate)
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }

      const onState = () => {
        if (pc.iceGatheringState === 'complete') finish()
      }

      pc.addEventListener('icegatheringstatechange', onState)
      // Fallback timeout (some environments never fire 'complete' reliably)
      setTimeout(() => finish(), 2500)
    })

    pc.close()

    // Candidate type heuristic: typ host/srflx/relay.
    const types = new Set<string>()
    for (const c of candidates) {
      const m = c.match(/\btyp\s+(\w+)\b/i)
      if (m?.[1]) types.add(m[1].toLowerCase())
    }

    if (types.has('relay')) return 'relay'
    if (types.has('srflx')) return 'nat'
    if (types.has('host')) return 'local_only'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function NatGlyph({ variant }: { variant: 'open' | 'moderate' | 'strict' | 'checking' }) {
  // Custom glyphs (not Lucide) so all icons are optically centered and consistent at tiny sizes.
  const common = {
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    className: 'h-[10px] w-[10px] block',
  }

  if (variant === 'open') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M3.25 8.25L6.6 11.25L12.75 4.75" />
      </svg>
    )
  }

  if (variant === 'strict') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M4.5 4.5L11.5 11.5" />
        <path d="M11.5 4.5L4.5 11.5" />
      </svg>
    )
  }

  // moderate + checking use a slash (checking is color-driven, not animation here)
  return (
    <svg {...common} aria-hidden="true">
      <path d="M4.25 12L11.75 4" />
    </svg>
  )
}

export function SignalingStatus() {
  const { status, signalingUrl } = useSignaling()
  const [nat, setNat] = useState<NatIndicator>('checking')
  const [natOverride, setNatOverrideState] = useState<NatOverride>(() => getNatOverride())
  const navigate = useNavigate()

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-green-500'
      case 'disconnected':
        return 'text-red-500'
      case 'checking':
        return 'text-yellow-500'
    }
  }

  const getTooltipText = () => {
    switch (status) {
      case 'connected':
        return `Connected to ${signalingUrl}. Full features available including room creation.`
      case 'disconnected':
        return `Cannot connect to ${signalingUrl}. Limited to single default room per house.`
      case 'checking':
        return `Checking connection to ${signalingUrl}...`
    }
  }

  type NatExperience = 'checking' | 'open' | 'moderate' | 'strict'

  const natExperience: NatExperience = useMemo(() => {
    if (natOverride !== 'auto') return natOverride
    // Heuristic mapping:
    // - If we got a server-reflexive candidate, STUN is working => "open" (best user experience).
    // - If we only got host candidates, NAT traversal is likely limited => "strict".
    // - If we couldn't determine (or got relay), call it "moderate" for now.
    if (nat === 'checking') return 'checking'
    if (nat === 'nat') return 'open'
    if (nat === 'local_only') return 'strict'
    return 'moderate'
  }, [nat, natOverride])

  const getNatBadge = () => {
    switch (natExperience) {
      case 'open':
        return { label: 'NAT: Open', className: 'border-green-500/70 text-green-500', glyph: 'open' as const }
      case 'moderate':
        return { label: 'NAT: Moderate', className: 'border-amber-500/70 text-amber-500', glyph: 'moderate' as const }
      case 'strict':
        return { label: 'NAT: Strict / CGNAT', className: 'border-red-500/70 text-red-500', glyph: 'strict' as const }
      case 'checking':
        return { label: 'NAT: Checking…', className: 'border-amber-500/60 text-amber-500', glyph: 'checking' as const }
    }
  }

  const getNatText = () => {
    if (natOverride !== 'auto') {
      return `Override enabled: ${natOverride.toUpperCase()}. (For UI testing only — does not change real connectivity.)`
    }
    // Keep a slightly more technical detail for the tooltip.
    switch (nat) {
      case 'nat':
        return 'Detected srflx ICE candidates (STUN working).'
      case 'relay':
        return 'Detected relay ICE candidates.'
      case 'local_only':
        return 'Only host ICE candidates detected (no srflx/relay).'
      case 'checking':
        return 'Probing ICE candidates…'
      case 'unknown':
        return 'Could not determine ICE candidate types.'
    }
  }

  useEffect(() => {
    // Probe once per app session (SignalingStatus appears on multiple pages).
    if (!natProbePromise) natProbePromise = probeNatIndicator()
    natProbePromise.then(setNat).catch(() => setNat('unknown'))
  }, [])

  useEffect(() => {
    const onChanged = () => setNatOverrideState(getNatOverride())
    window.addEventListener('roommate:nat-override-changed', onChanged)
    return () => window.removeEventListener('roommate:nat-override-changed', onChanged)
  }, [])

  return (
    <div className="flex items-center gap-0">
      {/* NAT (left) */}
      <div className="relative group">
        <button
          type="button"
          onClick={() => navigate('/settings?tab=connections')}
          className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
          aria-label="Open Connections settings (NAT status)"
        >
          {(() => {
            const badge = getNatBadge()
            return (
              <div className={`h-[13px] w-[13px] rounded-none border-2 grid place-items-center ${badge.className}`}>
                <NatGlyph variant={badge.glyph} />
              </div>
            )
          })()}
        </button>

        {/* NAT Tooltip */}
        <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-popover border-2 border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
          <div className="space-y-2">
            <p className="text-xs font-light leading-relaxed">{getNatBadge().label}</p>
            <p className="text-xs font-light leading-relaxed text-muted-foreground">{getNatText()}</p>
            <p className="text-[11px] font-light text-muted-foreground">Click to open Connections settings.</p>
          </div>
        </div>
      </div>

      {/* Signaling (right) */}
      <div className="relative group">
        <button
          type="button"
          onClick={() => navigate('/settings?tab=connections')}
          className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
          aria-label="Open Connections settings (Signaling status)"
        >
          <Square className={`h-2 w-2 fill-current ${getStatusColor()}`} />
          {status !== 'connected' && (
            <span className="text-xs font-light text-muted-foreground">
              {status === 'checking' ? 'Checking' : 'Disconnected'}
            </span>
          )}
        </button>

        {/* Signaling Tooltip */}
        <div className="absolute top-full right-0 mt-2 w-64 p-3 bg-popover border-2 border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
          <div className="space-y-2">
            <p className="text-xs font-light leading-relaxed">{getTooltipText()}</p>
            <p className="text-[11px] font-light text-muted-foreground">Click to open Connections settings.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
