import { describe, it, expect } from 'vitest'
import {
  extractLineNumberFromError,
  extractLineFromStack,
  formatErrorMessage,
  formatEvalErrorWithUserLine,
  findWrappedLineWithAcorn,
  mapEvalLineToUserLine,
} from './errorLineMapper'

describe('errorLineMapper', () => {
  describe('extractLineNumberFromError', () => {
    it('extracts line number from SyntaxError message with "at line X"', () => {
      const error = new SyntaxError('Unexpected token at line 5 column 10')
      expect(extractLineNumberFromError(error)).toBe(5)
    })

    it('extracts line number from error message with "(line X,"', () => {
      const error = new Error('ReferenceError: x is not defined (line 3, column 1)')
      expect(extractLineNumberFromError(error)).toBe(3)
    })

    it('extracts line number from error message with "at line X"', () => {
      const error = new Error('TypeError at line 10 column 5')
      expect(extractLineNumberFromError(error)).toBe(10)
    })

    it('returns null when no line number found', () => {
      const error = new Error('Generic error message')
      expect(extractLineNumberFromError(error)).toBeNull()
    })

    it('returns null for non-Error objects', () => {
      expect(extractLineNumberFromError('not an error')).toBeNull()
      expect(extractLineNumberFromError(null)).toBeNull()
      expect(extractLineNumberFromError(undefined)).toBeNull()
    })
  })

  describe('extractLineFromStack', () => {
    it('extracts line number from Chrome-style stack trace', () => {
      const stack = 'Error: test\n    at foo (file.js:10:5)\n    at bar (file.js:15:3)'
      // Should NOT match file.js:10:5 - we want <anonymous> frames only
      expect(extractLineFromStack(stack)).toBeNull()
    })

    it('extracts line number from <anonymous> frames (eval code)', () => {
      const stack = 'ReferenceError: x is not defined\n    at foo (eval at compile (file.js:394:21), <anonymous>:42:8)\n    at bar (file.js:10:5)'
      expect(extractLineFromStack(stack)).toBe(42)
    })

    it('extracts line number from Firefox-style <anonymous> stack trace', () => {
      const stack = 'Error: test\nfoo@<anonymous>:12:8\nbar@file.js:18:4'
      expect(extractLineFromStack(stack)).toBe(12)
    })

    it('returns null when no <anonymous> line number found', () => {
      const stack = 'Error: test\n    at foo ()\n    at bar ()'
      expect(extractLineFromStack(stack)).toBeNull()
    })

    it('returns null for undefined/empty stack', () => {
      expect(extractLineFromStack(undefined)).toBeNull()
      expect(extractLineFromStack('')).toBeNull()
    })

    it('ignores source file line numbers (the 394 issue)', () => {
      const stack = 'ReferenceError: leftRotationp is not defined\n    at findCorrectionVector (eval at compileCustomTransform (http://localhost:5173/file.ts:394:21), <anonymous>:57:8)'
      expect(extractLineFromStack(stack)).toBe(57)
    })
  })

  describe('mapEvalLineToUserLine', () => {
    it('subtracts wrapper prefix lines', () => {
      expect(mapEvalLineToUserLine(25, 1, 22)).toBe(22)
      expect(mapEvalLineToUserLine(5, 2, 3)).toBe(3)
    })

    it('clamps to last user line when parser reports on wrapper suffix', () => {
      expect(mapEvalLineToUserLine(25, 1, 22)).toBe(22)
      expect(mapEvalLineToUserLine(6, 2, 3)).toBe(3)
    })

    it('never returns less than 1', () => {
      expect(mapEvalLineToUserLine(1, 5, 10)).toBe(1)
    })
  })

  describe('findWrappedLineWithAcorn', () => {
    it('finds syntax error line in full-function wrapper', () => {
      const source = [
        'function transform(input, dt, params, state, api) {',
        ...Array.from({ length: 8 }, (_, i) => `  // filler ${i + 1}`),
        '  @@@',
        '}',
      ].join('\n')
      const wrapped = `"use strict";\n${source}\nreturn transform;`
      expect(findWrappedLineWithAcorn(wrapped)).toBe(11)
    })

    it('finds syntax error line in inline legacy wrapper', () => {
      const wrapped = `"use strict";\nreturn function(input, dt, params, state, api) {\na\nb\nreturn {\n};`
      expect(findWrappedLineWithAcorn(wrapped)).toBe(6)
    })
  })

  describe('formatEvalErrorWithUserLine', () => {
    function makeSource(lineCount: number, lastLine = '  return {'): string {
      const lines = ['function transform(input, dt, params, state, api) {']
      for (let i = 1; i < lineCount - 1; i++) lines.push(`  // filler ${i}`)
      lines.push(lastLine)
      return lines.join('\n')
    }

    it('maps wrapped syntax error line to user source line for full functions', () => {
      const source = makeSource(22)
      const error = new SyntaxError("Unexpected token ')' at line 25 column 1")
      error.stack =
        "SyntaxError: Unexpected token ')'\n    at new Function (<anonymous>)\n    at compileCustomTransform (<anonymous>:25:1)"

      const result = formatEvalErrorWithUserLine(error, {
        prefixLines: 1,
        source,
        label: 'Failed to compile custom transformer "custom"',
      })

      expect(result.lineNumber).toBe(22)
      expect(result.message).toContain('(line 22)')
      expect(result.message).not.toContain('line 25')
    })

    it('maps wrapped syntax error line for inline legacy bodies', () => {
      const source = 'a\nb\nreturn {'
      const error = new SyntaxError("Unexpected token ')' at line 6 column 1")

      const result = formatEvalErrorWithUserLine(error, {
        prefixLines: 2,
        source,
        label: 'Failed to compile custom transformer "custom"',
      })

      expect(result.lineNumber).toBe(3)
      expect(result.message).toContain('(line 3)')
    })

    it('uses acorn fallback when engine omits line numbers', () => {
      const source = [
        'function transform(input, dt, params, state, api) {',
        ...Array.from({ length: 8 }, (_, i) => `  // filler ${i + 1}`),
        '  @@@',
        '}',
      ].join('\n')
      const wrapped = `"use strict";\n${source}\nreturn transform;`
      const error = new SyntaxError('Invalid or unexpected token')

      const result = formatEvalErrorWithUserLine(error, {
        prefixLines: 1,
        source,
        wrappedSource: wrapped,
        label: 'Failed to compile custom transformer "custom:p2"',
      })

      expect(result.lineNumber).toBe(10)
      expect(result.message).toContain('(line 10)')
    })
  })

  describe('formatErrorMessage', () => {
    it('adds line number to error message', () => {
      const error = new SyntaxError('Unexpected token at line 5 column 10')
      const result = formatErrorMessage(error, 'return x + y;', 'Transformer')
      expect(result.lineNumber).toBe(5)
      expect(result.message).toContain('line 5')
    })

    it('does not duplicate line info when already present', () => {
      const error = new SyntaxError('Unexpected token at line 5 column 10')
      const result = formatErrorMessage(error, 'return x + y;', 'Transformer')
      // Should not add duplicate line info
      const lineCount = (result.message.match(/line 5/g) || []).length
      expect(lineCount).toBe(1)
    })

    it('adds label to message - may extract line number from stack if available', () => {
      // Note: In Node.js, creating an Error captures the current file/line in the stack,
      // so this test error will have a line number from the stack trace.
      // In browser environments with user code, the line number would be from the user's code.
      const error = new Error('Generic error')
      const result = formatErrorMessage(error, 'return x + y;', 'Transformer')
      // Just check that the label is included
      expect(result.message).toContain('Transformer:')
    })
  })
})
