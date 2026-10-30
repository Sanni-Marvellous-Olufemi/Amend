import { LogOut, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface Props {
  connected: boolean | null
  mock: boolean
  onDisconnect: () => void
  onHome?: () => void
  showHome: boolean
}

export function Header({ connected, mock, onDisconnect, onHome, showHome }: Props) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-background/85 px-5 pt-4 pb-3 backdrop-blur">
      <button
        type="button"
        onClick={onHome}
        className="text-[22px] font-semibold tracking-[-0.04em] text-forest outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md"
        aria-label="AMEND home"
      >
        amend<span className="text-leaf">.</span>
      </button>
      <div className="flex items-center gap-1.5">
        {mock && (
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">Demo calendar</span>
        )}
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium',
            connected ? 'bg-leaf-soft text-forest' : 'bg-muted text-muted-foreground',
          )}
        >
          <span className={cn('size-1.5 rounded-full', connected ? 'bg-leaf' : 'bg-muted-foreground/50')} />
          {connected === null ? 'Checking…' : connected ? 'Connected' : 'Not connected'}
        </span>
        {showHome && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onHome} aria-label="Start over">
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Start over</TooltipContent>
          </Tooltip>
        )}
        {connected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onDisconnect} aria-label="Disconnect Google">
                <LogOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Disconnect Google</TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
