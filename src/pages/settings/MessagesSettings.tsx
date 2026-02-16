import { useEffect, useState } from 'react'
import { Label } from '../../components/ui/label'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { useAccount } from '../../contexts/AccountContext'
import { useActiveServer } from '../../contexts/ActiveServerContext'
import { useServers } from '../../contexts/ServersContext'
import {
  DEFAULT_MESSAGE_STORAGE_SETTINGS,
  getMessageStorageSettings,
  setMessageStorageSettings,
  type MessageStorageSettings,
} from '../../lib/messageSettings'

export function MessagesSettings() {
  const { currentAccountId } = useAccount()
  const { activeSigningPubkey } = useActiveServer()
  const { servers } = useServers()
  const [settings, setSettings] = useState<MessageStorageSettings>(DEFAULT_MESSAGE_STORAGE_SETTINGS)

  const activeServer = servers.find((s) => s.signing_pubkey === activeSigningPubkey)
  const canEdit = Boolean(activeSigningPubkey)

  useEffect(() => {
    if (!activeSigningPubkey) {
      setSettings({ ...DEFAULT_MESSAGE_STORAGE_SETTINGS })
      return
    }
    const loaded = getMessageStorageSettings(currentAccountId, activeSigningPubkey)
    setSettings(loaded)
  }, [currentAccountId, activeSigningPubkey])

  const applySettings = (next: MessageStorageSettings) => {
    setSettings(next)
    if (!activeSigningPubkey) return
    setMessageStorageSettings(currentAccountId, activeSigningPubkey, next)
  }

  const resetToRecommended = () => {
    applySettings({ ...DEFAULT_MESSAGE_STORAGE_SETTINGS })
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-light tracking-tight">Messages</h2>
          <p className="text-xs text-muted-foreground">
            These settings only affect local message cache on this device and server.
          </p>
        </div>
        <button
          type="button"
          onClick={resetToRecommended}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset to recommended
        </button>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
          {canEdit
            ? `Editing message storage for ${activeServer?.name ?? 'active server'}.`
            : 'Open a server first to edit its per-server message storage mode.'}
        </div>

        <div className="space-y-3 border border-border/50 rounded-md p-3">
          <div className="space-y-1">
            <Label htmlFor="msg-mode" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Storage mode
            </Label>
            <Select
              id="msg-mode"
              value={settings.mode}
              disabled={!canEdit}
              onChange={(e) =>
                applySettings({
                  ...settings,
                  mode: e.target.value === 'ephemeral' ? 'ephemeral' : 'persistent',
                })
              }
            >
              <option value="persistent">Persistent (default)</option>
              <option value="ephemeral">Ephemeral (memory only)</option>
            </Select>
            <p className="text-xs text-muted-foreground">
              Persistent keeps local history across restarts. Ephemeral clears on app close.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-max-on-open" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Max messages on server open
            </Label>
            <Input
              id="msg-max-on-open"
              type="number"
              min={50}
              max={5000}
              disabled={!canEdit}
              value={settings.max_messages_on_open}
              onChange={(e) =>
                applySettings({
                  ...settings,
                  max_messages_on_open: Math.max(50, Math.min(5000, Number(e.target.value || 500))),
                })
              }
              className="h-9 w-40"
            />
            <p className="text-xs text-muted-foreground">
              How many messages to load when opening this server.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-max-mb" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Max storage (MB)
            </Label>
            <Input
              id="msg-max-mb"
              type="number"
              min={1}
              max={512}
              disabled={!canEdit}
              value={settings.max_storage_mb}
              onChange={(e) =>
                applySettings({
                  ...settings,
                  max_storage_mb: Math.max(1, Math.min(512, Number(e.target.value || 150))),
                })
              }
              className="h-9 w-40"
            />
            <p className="text-xs text-muted-foreground">
              Approximate disk budget for message cache.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border/50 bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">
            Current behavior: <span className="text-foreground capitalize">{settings.mode}</span> mode,{' '}
            <span className="text-foreground">{settings.max_messages_on_open}</span> messages on open,{' '}
            <span className="text-foreground">{settings.max_storage_mb}MB</span> max storage.
          </p>
        </div>
      </div>
    </div>
  )
}

