/**
 * 将图片 data URL 缩放到最大边 1024px，生成 1K 缩略图
 */
const THUMB_MAX = 1024;

export async function createThumbnail(dataUrl: string, maxSize: number = THUMB_MAX): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= maxSize && h <= maxSize) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(maxSize / w, maxSize / h);
      const tw = Math.round(w * scale);
      const th = Math.round(h * scale);

      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, tw, th);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
    img.src = dataUrl;
  });
}
