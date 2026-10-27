const MAX_DIMENSION = 1800
const COMPRESS_THRESHOLD = 900 * 1024

async function dimensionsOf(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close?.()
    return size
  } catch {
    return { width: 0, height: 0 }
  }
}

/**
 * 上传前在浏览器里压缩图片：长边不超过 1800px，JPEG 质量 0.86。
 * 动图 / SVG 保持原样。
 */
export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) {
    return { file, width: 0, height: 0 }
  }
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
    const size = await dimensionsOf(file)
    return { file, ...size }
  }

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
    const needResize = scale < 1
    const needReencode = file.size > COMPRESS_THRESHOLD || file.type !== 'image/jpeg'

    if (!needResize && !needReencode) {
      bitmap.close?.()
      return { file, width, height }
    }

    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close?.()
      return { file, width, height }
    }
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob) return { file, width, height }

    const renamed = `${(file.name || 'photo').replace(/\.[^.]+$/, '')}.jpg`
    return {
      file: new File([blob], renamed, { type: 'image/jpeg', lastModified: Date.now() }),
      width: targetWidth,
      height: targetHeight,
    }
  } catch {
    const size = await dimensionsOf(file)
    return { file, ...size }
  }
}

export function imageUrl(key) {
  return `/api/img/${key.replace(/^\/+/, '')}`
}
