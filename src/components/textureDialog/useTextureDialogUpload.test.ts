import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTextureDialogUpload } from './useTextureDialogUpload'

function imageFile(name = 'cat.png'): File {
  return new File(['x'], name, { type: 'image/png' })
}

function videoFile(name = 'kitty.mp4'): File {
  return new File(['x'], name, { type: 'video/mp4' })
}

function unknownFile(name = 'doc.pdf'): File {
  return new File(['x'], name, { type: 'application/pdf' })
}

function makeDragEvent(files: File[]): React.DragEvent {
  const preventDefault = vi.fn()
  const stopPropagation = vi.fn()
  return {
    preventDefault,
    stopPropagation,
    dataTransfer: { files },
  } as unknown as React.DragEvent
}

let alertSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  alertSpy.mockRestore()
})

describe('useTextureDialogUpload', () => {
  it('starts idle (no preview, not dragging, no pending conversion)', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    expect(result.current.dragActive).toBe(false)
    expect(result.current.uploadPreview).toBeNull()
    expect(result.current.pendingVideoConversion).toBeNull()
  })

  it('handleDragEnter sets dragActive=true; handleDragLeave clears it', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    act(() => result.current.handleDragEnter(makeDragEvent([])))
    expect(result.current.dragActive).toBe(true)
    act(() => result.current.handleDragLeave(makeDragEvent([])))
    expect(result.current.dragActive).toBe(false)
  })

  it('drop with an image file stages a preview with a generated assetId', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    act(() => result.current.handleDrop(makeDragEvent([imageFile('cat.png')])))
    expect(result.current.uploadPreview).not.toBeNull()
    expect(result.current.uploadPreview?.file.name).toBe('cat.png')
    expect(result.current.uploadPreview?.assetId).toBeTruthy()
    expect(result.current.dragActive).toBe(false)
  })

  it('drop with a video file stages a video preview when allowVideo=true', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    act(() => result.current.handleDrop(makeDragEvent([videoFile()])))
    expect(result.current.uploadPreview?.file.type).toBe('video/mp4')
  })

  it('drop with a video file is silently ignored when allowVideo=false', () => {
    const { result } = renderHook(() => useTextureDialogUpload(false))
    act(() => result.current.handleDrop(makeDragEvent([videoFile()])))
    expect(result.current.uploadPreview).toBeNull()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('drop with only an unknown file is a silent no-op (no alert, no preview)', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    act(() => result.current.handleDrop(makeDragEvent([unknownFile()])))
    expect(result.current.uploadPreview).toBeNull()
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('handleFileInput with an unknown file alerts the user', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    const input = document.createElement('input')
    Object.defineProperty(input, 'files', { value: [unknownFile()] })
    const event = { target: input } as unknown as React.ChangeEvent<HTMLInputElement>
    act(() => result.current.handleFileInput(event))
    expect(alertSpy).toHaveBeenCalledWith('Please drop an image or video file.')
    expect(result.current.uploadPreview).toBeNull()
  })

  it('handleFileInput stages a preview from the file input and resets the input value', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    const input = document.createElement('input')
    input.type = 'file'
    Object.defineProperty(input, 'files', { value: [imageFile('a.png')] })
    input.value = ''
    const event = { target: input } as unknown as React.ChangeEvent<HTMLInputElement>
    act(() => result.current.handleFileInput(event))
    expect(result.current.uploadPreview?.file.name).toBe('a.png')
  })

  it('handleFileInput is a no-op when no files are selected', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    const input = document.createElement('input')
    Object.defineProperty(input, 'files', { value: [] })
    const event = { target: input } as unknown as React.ChangeEvent<HTMLInputElement>
    act(() => result.current.handleFileInput(event))
    expect(result.current.uploadPreview).toBeNull()
  })

  it('resetUpload clears preview and dragActive (leaves pending conversion alone)', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    act(() => result.current.handleDragEnter(makeDragEvent([])))
    act(() => result.current.handleDrop(makeDragEvent([imageFile()])))
    act(() => result.current.setPendingVideoConversion({ file: videoFile(), assetId: 'v' }))
    act(() => result.current.resetUpload())
    expect(result.current.dragActive).toBe(false)
    expect(result.current.uploadPreview).toBeNull()
    expect(result.current.pendingVideoConversion).not.toBeNull()
  })

  it('drop prefers an image over a video when both are present', () => {
    const { result } = renderHook(() => useTextureDialogUpload(true))
    act(() => result.current.handleDrop(makeDragEvent([videoFile(), imageFile('first.png')])))
    expect(result.current.uploadPreview?.file.name).toBe('first.png')
  })
})
