export function formatShortDateTime(value: string | null | undefined, fallback = 'Never'): string {
  if (!value) return fallback
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
