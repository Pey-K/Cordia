import { ArrowUpDown } from 'lucide-react'
import { Button } from './ui/button'
import { useTransferCenterModal } from '../contexts/TransferCenterModalContext'

export function TransferCenterButton() {
  const { openTransferCenter } = useTransferCenterModal()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      title="Open transfer center"
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        openTransferCenter(rect)
      }}
    >
      <ArrowUpDown className="h-4 w-4" />
    </Button>
  )
}

