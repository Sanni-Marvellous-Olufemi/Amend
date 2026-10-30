const SYMBOLS: Record<string, string> = {
  Command: '⌘',
  '⌘': '⌘',
  MacCtrl: '⌃',
  Ctrl: 'Ctrl',
  '⌃': '⌃',
  Shift: '⇧',
  '⇧': '⇧',
  Alt: '⌥',
  Option: '⌥',
  '⌥': '⌥',
}

/** Chrome reports Mac shortcuts as "⇧⌘6"; elsewhere as "Ctrl+Shift+6". */
export function splitShortcut(shortcut: string): string[] {
  if (shortcut.includes('+')) return shortcut.split('+').map((k) => SYMBOLS[k] ?? k)
  return [...shortcut].map((k) => SYMBOLS[k] ?? k)
}

export function KeyCaps({ shortcut, size = 'md' }: { shortcut: string; size?: 'sm' | 'md' }) {
  const keys = splitShortcut(shortcut)
  const cls =
    size === 'md'
      ? 'min-w-8 h-8 px-2 text-[15px] rounded-lg'
      : 'min-w-5 h-5 px-1 text-[11px] rounded-[5px]'
  return (
    <span className="inline-flex items-center gap-1" aria-label={shortcut}>
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className={`${cls} inline-flex items-center justify-center border border-b-2 bg-card font-sans font-medium text-forest shadow-[0_1px_0_rgba(32,43,37,0.06)]`}
        >
          {k}
        </kbd>
      ))}
    </span>
  )
}
