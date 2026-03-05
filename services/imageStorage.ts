/**
 * imageStorage.ts
 *
 * 统一的图片持久化服务。
 *
 * 运行环境检测：
 *   - Electron App：通过 preload 暴露的 window.electronFS IPC 接口，
 *     将图片以 PNG 文件形式存储到 {userData}/gallery/ 目录下。
 *     IndexedDB 只存元数据（不含 url 字段）。
 *
 *   - 纯浏览器（开发调试）：回退到原有 IndexedDB 方案，
 *     图片 base64 直接存在 generatedImages 数组里。
 */

import { get, set } from 'idb-keyval';
import { GeneratedImage } from '../types';

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
 * - Electron：图片文件写磁盘，元数据写 IndexedDB
 * - 浏览器：整个 GeneratedImage（含 url）写 IndexedDB
 */
export async function persistImage(img: GeneratedImage): Promise<void> {
    if (isElectron()) {
        // 1. 保存图片文件
        await window.electronFS!.saveImage(img.id, img.url);
        // 2. 追加元数据
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
        // 浏览器回退：整体写 IndexedDB
        const existing: GeneratedImage[] = (await get('generatedImages')) || [];
        existing.push(img);
        await set('generatedImages', existing);
    }
}

/**
 * 加载所有已持久化的图片（含 url）。
 * - Electron：读元数据 + 逐张从磁盘读 base64
 * - 浏览器：直接从 IndexedDB 读整体数组
 */
export async function loadAllImages(): Promise<GeneratedImage[]> {
    if (isElectron()) {
        const meta = await loadMeta();
        if (meta.length === 0) return [];

        // 并发读取所有图片文件
        const results = await Promise.all(
            meta.map(async (m): Promise<GeneratedImage | null> => {
                const url = await window.electronFS!.loadImage(m.id);
                if (!url) return null; // 文件已被删除，跳过
                return { ...m, url };
            })
        );

        return results.filter((r): r is GeneratedImage => r !== null);
    } else {
        return (await get('generatedImages')) || [];
    }
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
