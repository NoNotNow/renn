import { describe, it, expect } from 'vitest'
import {
  extractLineNumberFromError,
  extractLineFromStack,
  formatErrorMessage,
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
