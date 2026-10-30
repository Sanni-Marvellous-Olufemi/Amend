import { MAX_IMAGE_EDGE } from './config'

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Downscale so the longest edge is at most `maxEdge`; Retina captures are ~5 MP and slow to infer. */
export async function downscale(dataUrl: string, maxEdge = MAX_IMAGE_EDGE): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && dataUrl.startsWith('data:image/jpeg')) {
    bitmap.close()
    return dataUrl
  }
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return blobToDataUrl(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 }))
}

export function imageFromClipboard(event: ClipboardEvent): File | null {
  for (const item of event.clipboardData?.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile()
  }
  return null
}

export { blobToDataUrl }
