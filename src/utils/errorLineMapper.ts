/**
 * Utilities to extract and display line numbers in error messages.
 */

/**
 * Attempts to extract a line number from a SyntaxError message.
 * Browser JavaScript engines include line numbers in SyntaxError messages.
 * Format: "SyntaxError: Unexpected token ... at line X column Y"
 * or "SyntaxError: ... (line X, column Y)"
 */
export function extractLineNumberFromError(error: unknown): number | null {
  if (!(error instanceof Error)) return null
  
  const message = error.message
  
  // Try to match "at line X" pattern
  const atLineMatch = message.match(/at line (\d+)/)
  if (atLineMatch) {
    return parseInt(atLineMatch[1], 10)
  }
  
  // Try to match "(line X," pattern
  const lineMatch = message.match(/(?:\(|at )line (\d+)/)
  if (lineMatch) {
    return parseInt(lineMatch[1], 10)
  }
  
  // Try to match Chrome/Edge format: ":X:Y" at the end
  const chromeMatch = message.match(/:\d+:(\d+)$/)
  if (chromeMatch) {
    return parseInt(chromeMatch[1], 10)
  }
  
  return null
}

/**
 * Attempts to extract line and column numbers from an error stack trace.
 * Returns the first user code line number found, or null.
 * Skips the first line (error message) and looks for stack frames.
 * 
 * Focuses on <anonymous> frames (eval'd user code) to avoid picking up
 * line numbers from source files.
 */
export function extractLineFromStack(stack: string | undefined): number | null {
  if (!stack) return null
  
  const lines = stack.split('\n')
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Skip lines that look like error messages (start with error type names)
    if (line.startsWith('Error:') || line.startsWith('TypeError:') || 
        line.startsWith('ReferenceError:') || line.startsWith('SyntaxError:') ||
        line.startsWith('RangeError:')) {
      continue
    }
    
    // Match <anonymous>:line:column pattern from eval'd code
    // This appears in Chrome/Edge/Node when code is eval'd via new Function()
    const anonymousMatch = line.match(/<anonymous>:(\d+):(\d+)/)
    if (anonymousMatch) {
      return parseInt(anonymousMatch[1], 10)
    }
    
    // Also try to match eval frames: eval at ... (<anonymous>:line:column)
    const evalAnonymousMatch = line.match(/<anonymous>:(\d+):(\d+)/)
    if (evalAnonymousMatch) {
      return parseInt(evalAnonymousMatch[1], 10)
    }
    
    // Fallback: Chrome/Edge/V8 format: "at functionName (<anonymous>:line:column)"
    const chromeAnonymousMatch = line.match(/at\s+.+\(<anonymous>:(\d+):\d+\)/)
    if (chromeAnonymousMatch) {
      return parseInt(chromeAnonymousMatch[1], 10)
    }
    
    // Fallback for Firefox: function@<anonymous>:line:column
    const firefoxAnonymousMatch = line.match(/[^@]+@<anonymous>:(\d+):\d+/)
    if (firefoxAnonymousMatch) {
      return parseInt(firefoxAnonymousMatch[1], 10)
    }
    
    // Match eval at compileCustomTransform (...), <anonymous>:line:column
    const evalMatch = line.match(/<anonymous>:(\d+):(\d+)/)
    if (evalMatch) {
      return parseInt(evalMatch[1], 10)
    }
  }
  
  return null
}

/**
 * Creates a user-friendly error message with line information.
 */
export function formatErrorMessage(
  error: unknown,
  source: string,
  label: string
): { message: string; lineNumber?: number } {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  
  // Try to extract line number from the error message first (SyntaxError usually has it)
  let lineNumber = extractLineNumberFromError(error)
  
  // If not found in message, try the stack trace
  if (lineNumber === null && stack) {
    lineNumber = extractLineFromStack(stack)
  }
  
  // Build enhanced message
  let enhancedMessage = message
  
  // Check if message already contains line info
  const hasLineInfo = /at line \d+|line \d+,|:\d+:\d+/.test(message)
  
  if (lineNumber !== null && !hasLineInfo) {
    enhancedMessage = `${label}: ${message} (line ${lineNumber})`
  } else if (!message.includes(label)) {
    enhancedMessage = `${label}: ${message}`
  }
  
  return {
    message: enhancedMessage,
    lineNumber,
  }
}
