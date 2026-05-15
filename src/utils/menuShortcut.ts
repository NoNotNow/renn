/** True when the host OS is macOS (menu shortcuts use ⌘ instead of Ctrl). */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent)
}

/**
 * Formats a Windows-style shortcut string for display in menus.
 * Example: `Ctrl+Shift+S` → `⌘⇧S` on macOS.
 */
export function formatMenuShortcut(template: string): string {
  if (!isMacPlatform()) return template
  return template
    .replace(/Ctrl\+/g, '⌘')
    .replace(/Shift\+/g, '⇧')
    .replace(/Alt\+/g, '⌥')
}
