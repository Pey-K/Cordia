import { ArrowUpDown } from 'lucide-react'
import { TransferCenterPanel } from '../components/TransferCenterPanel'

export default function TransfersPage() {
  return (
    <div className="h-full min-h-0 p-3">
      <div className="h-full min-h-0 border-2 border-border bg-card/95 shadow-2xl flex flex-col rounded-none">
        <header className="h-10 shrink-0 border-b border-border/70 px-2 flex items-center">
          <ArrowUpDown className="h-4 w-4 mr-2" />
          <h1 className="text-xs font-light tracking-wider uppercase">Transfers</h1>
        </header>
        <div className="flex-1 min-h-0 p-2">
          <TransferCenterPanel />
        </div>
      </div>
    </div>
  )
}
