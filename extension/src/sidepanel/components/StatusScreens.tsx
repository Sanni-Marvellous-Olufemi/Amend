import { AlertCircle, CalendarSearch, Camera, CloudOff, KeyRound, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PanelError } from '../machine'

function Shell({ icon: Icon, title, children, tone = 'muted' }: { icon: typeof AlertCircle; title: string; children: React.ReactNode; tone?: 'muted' | 'danger' }) {
  return (
    <div className="space-y-4 rounded-2xl border bg-card px-5 py-6 text-center">
      <span
        className={`mx-auto flex size-11 items-center justify-center rounded-full ${tone === 'danger' ? 'bg-danger-soft text-destructive' : 'bg-muted text-muted-foreground'}`}
      >
        <Icon className="size-5" />
      </span>
      <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
      {children}
    </div>
  )
}

export function EmptyState({ onScanAgain }: { onScanAgain: () => void }) {
  return (
    <Shell icon={CalendarSearch} title="No event found">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        AMEND didn't see a date, a reschedule, or a cancellation here. Scroll the announcement into view and scan again,
        or paste a screenshot.
      </p>
      <Button variant="secondary" className="w-full rounded-xl" onClick={onScanAgain}>
        Back
      </Button>
    </Shell>
  )
}

export function ErrorState({ error, onRetry, onBack }: { error: PanelError; onRetry: () => void; onBack: () => void }) {
  const Icon = error.kind === 'backend' ? CloudOff : error.kind === 'capture' ? Camera : error.kind === 'auth' ? KeyRound : AlertCircle
  return (
    <Shell icon={Icon} title={error.title} tone="danger">
      <p className="text-[13px] leading-relaxed text-muted-foreground">{error.message}</p>
      {error.kind === 'backend' && /isn't running|offline/i.test(error.message + error.title) && (
        <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-left text-[11.5px] leading-relaxed text-foreground/80">
          {'# in the Amend folder, then keep it open\nmake up'}
        </pre>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1 rounded-xl" onClick={onBack}>
          Back
        </Button>
        {error.retryable && (
          <Button className="flex-1 rounded-xl" onClick={onRetry}>
            <RotateCw /> {error.kind === 'auth' ? 'Reconnect' : 'Try again'}
          </Button>
        )}
      </div>
    </Shell>
  )
}

export function NeedsAuth({ onConnect, busy }: { onConnect: () => void; busy: boolean }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <p className="text-[14px] font-semibold">Connect Google Calendar to continue</p>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        AMEND found something to add or change. Connect your calendar so it can check for existing events. Nothing changes
        until you approve.
      </p>
      <Button className="h-10 w-full rounded-xl" onClick={onConnect} disabled={busy}>
        {busy ? 'Connecting…' : 'Connect Google Calendar'}
      </Button>
    </div>
  )
}
