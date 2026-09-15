const JPEG_QUALITY = 0.85

export function centeredSquare(width: number, height: number) {
  const side = Math.min(width, height)
  return { x: (width - side) / 2, y: (height - side) / 2, side }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Image illisible : ${src}`))
    image.src = src
  })
}

/** Recadre au centre en carré de `size` px au plus, en JPEG base64 sans préfixe. */
export async function squareJpegBase64(src: string, size: number): Promise<string> {
  const image = await loadImage(src)
  const { x, y, side } = centeredSquare(image.naturalWidth, image.naturalHeight)
  const output = Math.min(size, side)

  const canvas = document.createElement('canvas')
  canvas.width = output
  canvas.height = output
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D indisponible')

  context.imageSmoothingQuality = 'high'
  context.drawImage(image, x, y, side, side, 0, 0, output, output)

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
