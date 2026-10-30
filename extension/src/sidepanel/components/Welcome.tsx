import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Clipboard, Cpu, ImageUp, RotateCcw, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CalendarSummary, HealthResponse } from '@/types/events'
import { KeyCaps } from './KeyCaps'

interface Props {
  connected: boolean | null
  authBusy: boolean
  calendars: CalendarSummary[]
  calendarId: string
  health: HealthResponse | null | 'offline'
  mock: boolean
  notice?: string | null
  onConnect: () => void
  onChooseCalendar: (id: string) => void
  onPickFile: (file: File) => void
  onRescan: () => Promise<boolean>
  onResetDemo: () => void
}

function useShortcuts() {
  const [shortcuts, setShortcuts] = useState<{ main: string; alt: string }>({ main: '', alt: '' })
  useEffect(() => {
    chrome.commands.getAll().then((cmds) => {
      setShortcuts({
        main: cmds.find((c) => c.name === 'scan-event')?.shortcut ?? '',
        alt: cmds.find((c) => c.name === 'scan-event-alt')?.shortcut ?? '',
      })
    })
  }, [])
  return shortcuts
}

function Section({ step, title, children, delay = 0 }: { step: number; title: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
      className="rounded-2xl border bg-card p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-forest text-[11px] font-semibold text-primary-foreground">
          {step}
        </span>
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
      </div>
      {children}
    </motion.section>
  )
}

export function Welcome(props: Props) {
  const { connected, authBusy, calendars, calendarId, health, mock, notice } = props
  const shortcuts = useShortcuts()
  const fileRef = useRef<HTMLInputElement>(null)
  const [rescanFailed, setRescanFailed] = useState(false)

  const aiOk = health !== null && health !== 'offline' && health.ok
  const aiLabel =
    health === null
      ? 'Checking local AI…'
      : health === 'offline'
        ? 'Local AI service is offline'
        : health.mock
          ? 'Mock model (AMEND_MOCK=1)'
          : health.ok
            ? health.model
            : (health.detail ?? 'Model unavailable')

  return (
    <div className="space-y-3">
      <div className="px-1 pt-1 pb-2">
        <h1 className="text-[26px] leading-[1.1] font-semibold tracking-[-0.035em] text-forest">
          See a change.
          <br />
          Make it happen.
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Scan a flyer, email, or group chat. AMEND reads it with a model running on your Mac and proposes the calendar
          change. Nothing happens until you approve.
        </p>
      </div>

      {notice && <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[12.5px] text-muted-foreground">{notice}</p>}

      <Section step={1} title="Connect Google Calendar">
        {connected ? (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">Calendar AMEND will change</p>
            <Select value={calendarId} onValueChange={props.onChooseCalendar}>
              <SelectTrigger className="h-9 w-full rounded-lg bg-card text-[13.5px]">
                <SelectValue placeholder="Choose a calendar" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="size-2 rounded-full" style={{ background: c.backgroundColor ?? '#287B54' }} />
                    {c.summary}
                    {c.primary && <span className="text-muted-foreground">(primary)</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {calendars.find((c) => c.id === calendarId)?.primary && (
              <p className="text-[11.5px] text-warn">Tip: use a separate test calendar while demoing deletes.</p>
            )}
            {mock && (
              <button type="button" onClick={props.onResetDemo} className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                <RotateCcw className="size-3" /> Reset demo calendar
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Button className="h-10 w-full rounded-xl" onClick={props.onConnect} disabled={authBusy || connected === null}>
              {authBusy ? 'Connecting…' : mock ? 'Connect demo calendar' : 'Connect Google Calendar'}
            </Button>
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
              AMEND only asks for permission to manage events. Your token never leaves Chrome.
            </p>
          </div>
        )}
      </Section>

      <Section step={2} title="Scan any page" delay={0.05}>
        <div className="flex items-center justify-between gap-2">
          {shortcuts.main ? <KeyCaps shortcut={shortcuts.main} /> : <span className="text-[12.5px] text-warn">No shortcut assigned</span>}
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={async () => setRescanFailed(!(await props.onRescan()))}
          >
            <ScanLine /> Scan this tab
          </Button>
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
          Press it while viewing an announcement.
          {shortcuts.alt && (
            <>
              {' '}
              Alternate: <KeyCaps shortcut={shortcuts.alt} size="sm" />
            </>
          )}{' '}
          <button
            type="button"
            className="font-medium text-leaf hover:underline"
            onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Change shortcuts
          </button>
        </p>
        {rescanFailed && (
          <p className="mt-2 text-[12px] text-warn">Chrome needs the shortcut pressed on the page first. Or paste a screenshot below.</p>
        )}
      </Section>

      <motion.button
        type="button"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-foreground/15 bg-card/60 px-4 py-3.5 text-left transition-colors hover:border-leaf/50 hover:bg-card"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <ImageUp className="size-4" />
        </span>
        <span className="flex-1">
          <span className="block text-[13.5px] font-medium">Paste or upload a screenshot</span>
          <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
            <Clipboard className="size-3" /> Press ⌘V anywhere in this panel
          </span>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) props.onPickFile(file)
            e.target.value = ''
          }}
        />
      </motion.button>

      <div className="flex items-center gap-2 px-1 pt-1 text-[11.5px] text-muted-foreground">
        <span className={cn('size-1.5 rounded-full', aiOk ? 'bg-leaf' : health === null ? 'bg-muted-foreground/40' : 'bg-destructive')} />
        <Cpu className="size-3" />
        <span className="truncate">{aiLabel}</span>
      </div>
    </div>
  )
}
