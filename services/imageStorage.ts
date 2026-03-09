/**
 * imageStorage.ts
 *
 * 统一的图片持久化服务。
 *
 * 运行环境检测：
 *   - Electron App：通过 preload 暴露的 window.electronFS IPC 接口，
 *     将图片以 PNG 文件形式存储到 {userData}/gallery/ 目录下。
 *     画廊展示用 1K 缩略图，点击放大时按需加载原图。
 *
 *   - 纯浏览器（开发调试）：回退到原有 IndexedDB 方案，
 *     图片 base64 直接存在 generatedImages 数组里。
 */

import { get, set } from 'idb-keyval';
import { GeneratedImage } from '../types';
import { createThumbnail } from '../utils/imageUtils';

const isElectron = (): boolean => typeof window !== 'undefined' && !!window.electronFS;

// ──────────────────────────────────────────────
// 元数据 key（不含图片内容，存 IndexedDB）
// ──────────────────────────────────────────────
const META_KEY = 'galleryMeta';

interface ImageMeta {
    id: string;
    prompt: string;
    timestamp: number;
    modelUsed: string;
    parameters: any;
}

async function loadMeta(): Promise<ImageMeta[]> {
    return (await get(META_KEY)) || [];
}

async function saveMeta(meta: ImageMeta[]): Promise<void> {
    await set(META_KEY, meta);
}

// ──────────────────────────────────────────────
// 公开 API
// ──────────────────────────────────────────────

/**
 * 将单张生成图片持久化（追加）。
 * - Electron：原图 + 1K 缩略图写磁盘，元数据写 IndexedDB
 * - 浏览器：生成缩略图后整体写 IndexedDB
 */
export async function persistImage(img: GeneratedImage): Promise<void> {
    const thumb = await createThumbnail(img.url);
    if (isElectron()) {
        await window.electronFS!.saveImage(img.id, img.url);
        await window.electronFS!.saveThumbnail(img.id, thumb);
        const meta = await loadMeta();
        meta.push({
            id: img.id,
            prompt: img.prompt,
            timestamp: img.timestamp,
            modelUsed: img.modelUsed,
            parameters: img.parameters,
        });
        await saveMeta(meta);
    } else {
        const existing: GeneratedImage[] = (await get('generatedImages')) || [];
        existing.push({ ...img, thumbnailUrl: thumb });
        await set('generatedImages', existing);
    }
}

/**
 * 加载所有已持久化的图片（画廊用缩略图，不预加载原图）。
 * - Electron：读元数据 + 逐张从磁盘读缩略图（1K），原图按需 loadFullImage
 * - 浏览器：直接从 IndexedDB 读整体数组（含 thumbnailUrl）
 */
export async function loadAllImages(): Promise<GeneratedImage[]> {
    if (isElectron()) {
        const meta = await loadMeta();
        if (meta.length === 0) return [];

        const results = await Promise.all(
            meta.map(async (m): Promise<GeneratedImage | null> => {
                const thumbnailUrl = await window.electronFS!.loadThumbnail(m.id);
                if (!thumbnailUrl) return null;
                return { ...m, thumbnailUrl, url: '' };
            })
        );

        return results.filter((r): r is GeneratedImage => r !== null);
    } else {
        const list = (await get('generatedImages')) || [];
        return list.map((img) => ({
            ...img,
            thumbnailUrl: img.thumbnailUrl ?? img.url,
        }));
    }
}

/**
 * 按需加载原图（Electron 从磁盘读取，浏览器直接返回已有 url）。
 */
export async function loadFullImage(img: GeneratedImage): Promise<string> {
    if (img.url && !img.url.startsWith('file:')) return img.url;
    if (isElectron()) {
        const url = await window.electronFS!.loadImage(img.id);
        if (!url) throw new Error(`图片不存在: ${img.id}`);
        return url;
    }
    return img.url || '';
}

/**
 * 删除单张图片（从磁盘 + 元数据）。
 */
export async function deletePersistedImage(id: string): Promise<void> {
    if (isElectron()) {
        await window.electronFS!.deleteImage(id);
        const meta = await loadMeta();
        await saveMeta(meta.filter(m => m.id !== id));
    } else {
        const existing: GeneratedImage[] = (await get('generatedImages')) || [];
        await set('generatedImages', existing.filter(img => img.id !== id));
    }
}
