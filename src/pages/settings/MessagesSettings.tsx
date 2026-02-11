import { useEffect, useState } from 'react'
import { Label } from '../../components/ui/label'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { useAccount } from '../../contexts/AccountContext'
import {
  DEFAULT_MESSAGE_STORAGE_SETTINGS,
  getMessageStorageSettings,
  setMessageStorageSettings,
  type MessageStorageSettings,
} from '../../lib/messageSettings'

type RetentionPreset = '24h' | '72h' | '168h' | '720h' | 'custom'

function retentionPresetFor(hours: number): RetentionPreset {
  if (hours === 24) return '24h'
  if (hours === 72) return '72h'
  if (hours === 168) return '168h'
  if (hours === 720) return '720h'
  return 'custom'
}

export function MessagesSettings() {
  const { currentAccountId } = useAccount()
  const [settings, setSettings] = useState<MessageStorageSettings>(DEFAULT_MESSAGE_STORAGE_SETTINGS)
  const [retentionPreset, setRetentionPreset] = useState<RetentionPreset>('72h')

  useEffect(() => {
    const loaded = getMessageStorageSettings(currentAccountId)
    setSettings(loaded)
    setRetentionPreset(retentionPresetFor(loaded.retention_hours))
  }, [currentAccountId])

  const applySettings = (next: MessageStorageSettings) => {
    setSettings(next)
    setMessageStorageSettings(currentAccountId, next)
  }

  const resetToRecommended = () => {
    setRetentionPreset(retentionPresetFor(DEFAULT_MESSAGE_STORAGE_SETTINGS.retention_hours))
    applySettings({ ...DEFAULT_MESSAGE_STORAGE_SETTINGS })
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/50 space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-light tracking-tight">Messages</h2>
          <p className="text-xs text-muted-foreground">
            These settings only affect local message cache on this device/account.
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
        <div className="border border-border/50 rounded-md p-3 space-y-3">
          <Label htmlFor="msg-retention-preset" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Retention timeframe
          </Label>
          <Select
            id="msg-retention-preset"
            value={retentionPreset}
            onChange={(e) => {
              const preset = e.target.value as RetentionPreset
              setRetentionPreset(preset)
              if (preset === 'custom') return
              const hours = Number(preset.replace('h', ''))
              applySettings({ ...settings, retention_hours: hours })
            }}
          >
            <option value="24h">24 hours</option>
            <option value="72h">3 days (default)</option>
            <option value="168h">7 days</option>
            <option value="720h">30 days</option>
            <option value="custom">Custom</option>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={24 * 365}
              value={settings.retention_hours}
              onChange={(e) => {
                const hours = Math.max(1, Math.min(24 * 365, Number(e.target.value || 72)))
                setRetentionPreset(retentionPresetFor(hours))
                applySettings({ ...settings, retention_hours: hours })
              }}
              className="h-10 w-32"
            />
            <span className="text-xs text-muted-foreground">hours</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Older messages than this are removed from local cache.
          </p>
        </div>

        <div className="space-y-3 border border-border/50 rounded-md p-3">
          <div className="space-y-1">
            <Label htmlFor="msg-max-per-chat" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Max per chat
            </Label>
            <Input
              id="msg-max-per-chat"
              type="number"
              min={20}
              max={20000}
              value={settings.max_messages_per_chat}
              onChange={(e) =>
                applySettings({
                  ...settings,
                  max_messages_per_chat: Math.max(20, Math.min(20000, Number(e.target.value || 500))),
                })
              }
              className="h-9 w-40"
            />
            <p className="text-xs text-muted-foreground">
              Keeps only the newest N messages for each chat.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-max-total" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Max total messages
            </Label>
            <Input
              id="msg-max-total"
              type="number"
              min={100}
              max={100000}
              value={settings.max_total_messages}
              onChange={(e) =>
                applySettings({
                  ...settings,
                  max_total_messages: Math.max(100, Math.min(100000, Number(e.target.value || 5000))),
                })
              }
              className="h-9 w-40"
            />
            <p className="text-xs text-muted-foreground">
              Global cap across all servers/DMs for this account.
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
              value={settings.max_storage_mb}
              onChange={(e) =>
                applySettings({
                  ...settings,
                  max_storage_mb: Math.max(1, Math.min(512, Number(e.target.value || 16))),
                })
              }
              className="h-9 w-40"
            />
            <p className="text-xs text-muted-foreground">
              Approximate disk budget for message cache.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-max-sync-kb" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Max sync transfer (KB)
            </Label>
            <Input
              id="msg-max-sync-kb"
              type="number"
              min={32}
              max={4096}
              value={settings.max_sync_kb}
              onChange={(e) =>
                applySettings({
                  ...settings,
                  max_sync_kb: Math.max(32, Math.min(4096, Number(e.target.value || 256))),
                })
              }
              className="h-9 w-40"
            />
            <p className="text-xs text-muted-foreground">
              Reserved cap for peer history sync transfer bursts.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border/50 bg-muted/20 p-4">
          <p className="text-xs text-muted-foreground">
            Current behavior: keep up to <span className="text-foreground">{settings.retention_hours}h</span>,{' '}
            <span className="text-foreground">{settings.max_messages_per_chat}</span> per chat,{' '}
            <span className="text-foreground">{settings.max_total_messages}</span> total,{' '}
            <span className="text-foreground">{settings.max_storage_mb}MB</span> max,{' '}
            <span className="text-foreground">{settings.max_sync_kb}KB</span> sync burst cap.
          </p>
        </div>
      </div>
    </div>
  )
}

