const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isJsDom(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom')
}

function isVisible(element: HTMLElement): boolean {
  if (element.closest('[hidden]')) return false
  if (isJsDom()) return true

  return element.offsetParent !== null || element.getClientRects().length > 0
}

export function canRestoreFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false
  if (element.matches(':disabled, [aria-disabled="true"]')) return false
  if (!element.matches(FOCUSABLE_SELECTOR) && element.tabIndex < 0) return false

  return isVisible(element)
}

export function trapDialogTabFocus(
  event: KeyboardEvent,
  dialog: HTMLElement,
): void {
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => isVisible(element) || element === document.activeElement)

  if (focusable.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  const insideDialog = active instanceof Node && dialog.contains(active)

  if (!insideDialog) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
    return
  }

  if (event.shiftKey && (active === first || active === dialog)) {
    event.preventDefault()
    last.focus()
    return
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
