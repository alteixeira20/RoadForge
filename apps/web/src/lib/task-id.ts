export function createInteractiveTaskId(): string {
  return `rf-t-${crypto.randomUUID()}`
}
