/**
 * Centralized UI interaction logger
 * Logs all user interactions (clicks, changes) with detailed context
 */

export type UIInteractionType = 'click' | 'change' | 'input' | 'select' | 'upload' | 'delete'

export interface UIInteractionLog {
  type: UIInteractionType
  component: string
  action: string
  details?: Record<string, unknown>
  timestamp: string
}

class UILogger {
  private logs: UIInteractionLog[] = []
  private readonly maxLogs = 1000 // Keep last 1000 logs in memory

  /**
   * Log a UI interaction
   */
  log(type: UIInteractionType, component: string, action: string, details?: Record<string, unknown>): void {
    const log: UIInteractionLog = {
      type,
      component,
      action,
      details,
      timestamp: new Date().toISOString(),
    }

    this.logs.push(log)
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // Log to console with formatting
    const detailsStr = details ? ` | ${JSON.stringify(details)}` : ''
    console.log(`[UI ${type.toUpperCase()}] ${component} > ${action}${detailsStr}`)
  }

  /**
   * Log a click interaction
   */
  click(component: string, action: string, details?: Record<string, unknown>): void {
    this.log('click', component, action, details)
  }

  /**
   * Log a change/input interaction
   */
  change(component: string, action: string, details?: Record<string, unknown>): void {
    this.log('change', component, action, details)
  }

  /**
   * Log a select interaction
   */
  select(component: string, action: string, details?: Record<string, unknown>): void {
    this.log('select', component, action, details)
  }

  /**
   * Log an upload interaction
   */
  upload(component: string, action: string, details?: Record<string, unknown>): void {
    this.log('upload', component, action, details)
  }

  /**
   * Log a delete interaction
   */
  delete(component: string, action: string, details?: Record<string, unknown>): void {
    this.log('delete', component, action, details)
  }

  /**
   * Get all logs
   */
  getLogs(): UIInteractionLog[] {
    return [...this.logs]
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = []
    console.log('[UI Logger] Logs cleared')
  }

  /**
   * Export logs as JSON
   */
  export(): string {
    return JSON.stringify(this.logs, null, 2)
  }
}

// Singleton instance
export const uiLogger = new UILogger()

// Make it available globally for debugging
if (typeof window !== 'undefined') {
  (window as Window & { uiLogger?: UILogger }).uiLogger = uiLogger
}
