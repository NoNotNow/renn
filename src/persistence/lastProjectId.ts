export const LAST_PROJECT_ID_KEY = 'renn-last-project-id'

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_ID_KEY)
  } catch {
    return null
  }
}

export function setLastProjectId(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_ID_KEY, id)
  } catch {
    // ignore quota or disabled localStorage
  }
}

export function clearLastProjectId(): void {
  try {
    localStorage.removeItem(LAST_PROJECT_ID_KEY)
  } catch {
    // ignore quota or disabled localStorage
  }
}
