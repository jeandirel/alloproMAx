import { toneClasses, type StatusTone } from '@/lib/marketplace-ui/status'

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${toneClasses(tone)}`}>
      {label}
    </span>
  )
}

export function StatusPillFor({ map, status }: { map: Record<string, { label: string; tone: StatusTone }>; status: string }) {
  const entry = map[status] ?? { label: status, tone: 'neutral' as StatusTone }
  return <StatusPill label={entry.label} tone={entry.tone} />
}
