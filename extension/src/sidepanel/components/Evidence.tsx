import { AlertTriangle } from 'lucide-react'

export function Evidence({ text }: { text: string }) {
  if (!text) return null
  return (
    <section className="rounded-xl bg-muted/70 px-4 py-3">
      <p className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Why AMEND suggested this
      </p>
      <blockquote className="mt-1.5 text-[13.5px] leading-snug text-foreground/90 italic">“{text}”</blockquote>
    </section>
  )
}

export function ReviewReasons({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null
  return (
    <ul className="space-y-1.5" aria-label="Needs your attention">
      {reasons.map((r) => (
        <li key={r} className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-warn">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {r}
        </li>
      ))}
    </ul>
  )
}
