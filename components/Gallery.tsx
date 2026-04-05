import React, { useState } from 'react';
import { GeneratedImage, LogEntry } from '../types';
import { Download, Calendar, Activity, Package, Trash2, FolderOpen, X } from 'lucide-react';
import { downloadImage } from '../services/geminiService';
import { getErrorMessage } from '../utils/errorUtils';
import { loadFullImage } from '../services/imageStorage';
import JSZip from 'jszip';

interface GalleryProps {
  images: GeneratedImage[];
  onDelete: (id: string) => Promise<void>;
  addLog: (entry: LogEntry) => void;
}

const Gallery: React.FC<GalleryProps> = ({ images, onDelete, addLog }) => {
  const [isZipping, setIsZipping] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightboxImg, setLightboxImg] = useState<GeneratedImage | null>(null);
  const [lightboxFullUrl, setLightboxFullUrl] = useState<string | null>(null);
  const [lightboxLoading, setLightboxLoading] = useState(false);

  const displayUrl = (img: GeneratedImage) => img.thumbnailUrl || img.url;

  const openLightbox = async (img: GeneratedImage) => {
    setLightboxImg(img);
    setLightboxFullUrl(null);
    const hasFull = img.url && img.url.length > 10;
    if (hasFull) {
      setLightboxFullUrl(img.url);
      return;
    }
    setLightboxLoading(true);
    try {
      const url = await loadFullImage(img);
      setLightboxFullUrl(url);
    } catch (e) {
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `加载原图失败: ${getErrorMessage(e)}` });
    } finally {
      setLightboxLoading(false);
    }
  };

  const closeLightbox = () => {
    setLightboxImg(null);
    setLightboxFullUrl(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这张图片吗？此操作不可恢复。')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } catch (e) {
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `删除图片失败: ${getErrorMessage(e)}` });
    } finally {
      setDeletingId(null);
    }
  };

  const handleShowInFolder = (id: string) => {
    if (window.electronFS?.showInFolder) {
      window.electronFS.showInFolder(id);
    }
  };

  const getFullUrl = async (img: GeneratedImage): Promise<string> => {
    if (img.url && img.url.length > 10) return img.url;
    return loadFullImage(img);
  };

  const handleDownloadSingle = async (img: GeneratedImage) => {
    try {
      const url = await getFullUrl(img);
      const ext = img.type === 'video' ? 'mp4' : 'png';
      downloadImage(url, `otato-${img.id}.${ext}`);
    } catch (e) {
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `加载原图失败: ${getErrorMessage(e)}` });
    }
  };

  const handleDownloadAll = async () => {
    if (images.length === 0) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("otato-batch");
      if (!folder) throw new Error("Failed to create zip folder");

      for (const img of images) {
        try {
          const url = await getFullUrl(img);
          let blob: Blob;
          if (url.startsWith('data:')) {
            const [header, data] = url.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
            const binary = atob(data);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
            blob = new Blob([array], { type: mimeType });
          } else {
            const response = await fetch(url);
            blob = await response.blob();
          }
          const filename = `img_${img.id}.png`;
          folder.file(filename, blob);
        } catch (e) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `添加图片到压缩包失败 (${img.id}): ${getErrorMessage(e)}` });
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const blobUrl = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `otato-batch-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      const msg = getErrorMessage(e);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `打包下载失败: ${msg}` });
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">画廊</h2>
        {images.length > 0 && (
          <button
            onClick={handleDownloadAll}
            disabled={isZipping}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-all"
          >
            {isZipping ? <Activity className="animate-spin" size={14} /> : <Package size={14} />}
            {isZipping ? "正在打包..." : `打包下载 (${images.length})`}
          </button>
        )}
      </div>

      {images.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
          <Activity size={48} className="mb-4 opacity-50" />
          <p>暂无生成产物。</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pb-20 custom-scrollbar">
          <div className="flex flex-wrap gap-4 content-start">
          {images.slice().reverse().map((img) => (
            <div key={img.id} className="flex-[1_1_140px] min-w-[120px] group relative rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-indigo-500 transition-all">
              {img.type === 'video' ? (
                <video
                  src={displayUrl(img)}
                  className="w-full h-auto block cursor-pointer"
                  onClick={() => openLightbox(img)}
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={displayUrl(img)}
                  alt="Generated"
                  className="w-full h-auto block cursor-pointer"
                  onClick={() => openLightbox(img)}
                />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                <p className="text-white text-[10px] font-medium line-clamp-3 mb-2 leading-relaxed">{img.prompt}</p>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1 text-[9px] text-gray-400 font-mono uppercase tracking-tighter">
                    <Calendar size={10} className="text-indigo-400" />
                    {new Date(img.timestamp).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {window.electronFS && (
                      <button
                        title="在访达中显示"
                        onClick={(e) => { e.stopPropagation(); handleShowInFolder(img.id); }}
                        className="p-1.5 bg-white/10 backdrop-blur text-white rounded-lg hover:bg-white/20 transition-all active:scale-90"
                      >
                        <FolderOpen size={12} />
                      </button>
                    )}
                    <button
                      title="下载"
                      onClick={(e) => { e.stopPropagation(); handleDownloadSingle(img); }}
                      className="p-1.5 bg-indigo-600/80 backdrop-blur text-white rounded-lg hover:bg-indigo-500 transition-all active:scale-90"
                    >
                      <Download size={12} />
                    </button>
                    <button
                      title="删除"
                      onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                      disabled={deletingId === img.id}
                      className="p-1.5 bg-red-600/80 backdrop-blur text-white rounded-lg hover:bg-red-500 transition-all active:scale-90 disabled:opacity-40"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white z-10"
            aria-label="关闭"
          >
            <X size={24} />
          </button>
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {lightboxLoading ? (
              <Activity className="animate-spin text-indigo-400" size={48} />
            ) : lightboxFullUrl ? (
              <>
                {lightboxImg.type === 'video' ? (
                  <video src={lightboxFullUrl} controls autoPlay loop className="max-w-full max-h-[85vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
                ) : (
                  <img src={lightboxFullUrl} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
                )}
                <p className="text-gray-400 text-sm mt-2 line-clamp-2 max-w-2xl">{lightboxImg.prompt}</p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      const ext = lightboxImg.type === 'video' ? 'mp4' : 'png';
                      lightboxFullUrl && downloadImage(lightboxFullUrl, `otato-${lightboxImg.id}.${ext}`);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm flex items-center gap-2"
                  >
                    <Download size={16} /> 下载原格式
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;
