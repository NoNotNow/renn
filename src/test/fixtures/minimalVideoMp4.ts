/**
 * Tiny ISO BMFF blob with `ftyp` at offset 4 (valid MP4 container signature).
 * Not guaranteed to decode in a media player or ffmpeg; used for sniff tests and fetch/load mocks.
 */
export const MINIMAL_MP4_BYTES = new Uint8Array([
  // ftyp box, 28 bytes: isom / mp41
  0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d,
  0x69, 0x73, 0x6f, 0x32, 0x6d, 0x70, 0x34, 0x31,
  // mdat box, 16 bytes (empty payload)
  0x00, 0x00, 0x00, 0x10, 0x6d, 0x64, 0x61, 0x74, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])

export function minimalMp4Blob(): Blob {
  return new Blob([MINIMAL_MP4_BYTES], { type: 'video/mp4' })
}

/** HTML download stub saved with a `.mp4` name (regression: NS_ERROR_DOM_MEDIA_METADATA_ERR). */
export const HTML_STUB_AS_MP4 = new Blob(
  ['<!DOCTYPE html><html><head><title>redirect</title></head><body></body></html>'],
  { type: 'video/mp4' },
)
