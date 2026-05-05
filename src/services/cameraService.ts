import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/**
 * Capacitor Camera로 갤러리 사진 선택
 * @returns base64 dataUrl, 취소 시 null
 */
export async function pickPhoto(): Promise<string | null> {
  try {
    const image = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos,
    });
    return image.dataUrl ?? null;
  } catch (err: any) {
    // 사용자 취소 또는 권한 거부는 조용히 처리
    const msg = (err?.message ?? '').toLowerCase();
    if (
      msg.includes('cancel') ||
      msg.includes('no image') ||
      msg.includes('denied') ||
      msg.includes('user denied')
    ) {
      return null;
    }
    console.error('[CameraService] 사진 선택 실패:', err);
    return null;
  }
}

/**
 * base64 dataUrl → Blob 변환
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * dataUrl 이미지를 최대 1200px로 압축 (quality 0.85)
 * @returns 압축된 Blob
 */
export async function compressDataUrl(dataUrl: string): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxSize = 1200;
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrlToBlob(dataUrl));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob ?? dataUrlToBlob(dataUrl)),
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => resolve(dataUrlToBlob(dataUrl));
    img.src = dataUrl;
  });
}
