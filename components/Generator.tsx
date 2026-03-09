import React, { useEffect, useRef } from 'react';
import {
  Zap,
  Image as ImageIcon,
  RefreshCw,
  Download,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Terminal,
  Sparkles,
  Plus,
  Trash2,
} from 'lucide-react';
import { AppSettings, GeneratedImage, LogEntry, AspectRatioType, ImageSizeType, ProtocolConfig } from '../types';
import { generateImage, downloadImage, isImageResult, fileToBase64 } from '../services/geminiService';
import { getErrorMessage } from '../utils/errorUtils';

interface GeneratorProps {
  isActive: boolean;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  addLog: (entry: LogEntry) => void;
  logs: LogEntry[];
  addGeneratedImage: (img: GeneratedImage) => Promise<void>;
}

const Generator: React.FC<GeneratorProps> = ({
  isActive,
  settings,
  setSettings,
  addLog,
  logs,
  addGeneratedImage
}) => {
  const [prompt1, setPrompt1] = React.useState<string>('');
  const [prompt2, setPrompt2] = React.useState<string>('');
  const [prompt3, setPrompt3] = React.useState<string>('');
  const [refImages, setRefImages] = React.useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatioType>('auto');
  const [imageSize, setImageSize] = React.useState<ImageSizeType>('1K');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showLogs, setShowLogs] = React.useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showLogs) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

  useEffect(() => {
    if (!isActive) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItems: DataTransferItem[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) imageItems.push(items[i]);
      }
      if (imageItems.length > 0) {
        e.preventDefault();
        for (const item of imageItems) {
          const blob = item.getAsFile();
          if (blob) {
            try {
              const base64 = await fileToBase64(blob as File);
              setRefImages(prev => [...prev, base64]);
            } catch (e) {
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `粘贴参考图失败: ${getErrorMessage(e)}` });
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isActive]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from<File>(files)) {
      try {
        const base64 = await fileToBase64(file);
        setRefImages(prev => [...prev, base64]);
      } catch (e) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `上传参考图失败 (${file.name}): ${getErrorMessage(e)}` });
      }
    }
    e.target.value = '';
  };

  const removeRefImage = (index: number) => {
    setRefImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    const combinedPrompt = [prompt1, prompt2, prompt3].filter(Boolean).join(' ');
    if (!combinedPrompt.trim()) {
      const msg = '请输入提示词';
      setError(msg);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `失败: ${msg}` });
      return;
    }
    setIsGenerating(true);
    setError(null);

    const config: ProtocolConfig = {
      aspectRatio,
      imageSize,
      customPrompt: combinedPrompt
    };

    try {
      const resultUrl = await generateImage(config, settings.apiConfig, refImages);
      setLastResult(resultUrl);

      if (resultUrl && isImageResult(resultUrl)) {
        let persistUrl = resultUrl;
        if (resultUrl.startsWith('http')) {
          try {
            const resp = await fetch(resultUrl);
            const blob = await resp.blob();
            persistUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (convertErr) {
            const msg = getErrorMessage(convertErr);
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `URL 转 base64 失败: ${msg}` });
          }
        }
        addGeneratedImage({
          id: Date.now().toString(),
          url: persistUrl,
          prompt: combinedPrompt,
          timestamp: Date.now(),
          modelUsed: settings.apiConfig.modelName,
          parameters: config
        });
      }

      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'SUCCESS', message: '生成成功' });
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `失败: ${msg}` });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isActive) return null;

  return (
    <div className="h-full flex flex-col md:flex-row bg-gray-950 overflow-hidden">
      <div className="w-full md:w-96 border-r border-gray-800 flex flex-col bg-gray-900/30 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg"><Sparkles className="text-indigo-400" size={20} /></div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">生图</h2>
              <p className="text-[10px] text-gray-500 font-mono">IMAGE GENERATION</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-2">
              <Terminal size={12} className="text-indigo-400" />
              提示词 1
            </label>
            <textarea
              value={prompt1}
              onChange={(e) => setPrompt1(e.target.value)}
              placeholder="描述你想生成的场景..."
              className="w-full h-24 bg-black/50 border border-gray-800 rounded-xl p-4 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-2">
              <Terminal size={12} className="text-indigo-400" />
              提示词 2
            </label>
            <textarea
              value={prompt2}
              onChange={(e) => setPrompt2(e.target.value)}
              placeholder="追加补充描述（可选）..."
              className="w-full h-24 bg-black/50 border border-gray-800 rounded-xl p-4 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-2">
              <Terminal size={12} className="text-indigo-400" />
              提示词 3
            </label>
            <textarea
              value={prompt3}
              onChange={(e) => setPrompt3(e.target.value)}
              placeholder="追加补充描述（可选）..."
              className="w-full h-24 bg-black/50 border border-gray-800 rounded-xl p-4 text-sm text-gray-200 focus:ring-2 focus:ring-indigo-500/50 outline-none resize-none"
            />
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center justify-between">
              <span className="flex items-center gap-2"><ImageIcon size={12} className="text-indigo-400" /> 参考图</span>
              <span className="text-[8px] text-indigo-400/50">粘贴 / 拖拽 / 多选</span>
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from<File>(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                files.forEach(f => fileToBase64(f)
                  .then(b => setRefImages(prev => [...prev, b]))
                  .catch(e => addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `拖拽参考图失败 (${f.name}): ${getErrorMessage(e)}` })));
              }}
              className="space-y-2"
            >
              {refImages.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {refImages.map((src, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-700 bg-gray-900 group">
                      <img src={src} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button onClick={() => removeRefImage(idx)} className="p-1.5 bg-red-500 rounded-full text-white hover:bg-red-600">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-700 bg-gray-900/50 hover:border-indigo-500 cursor-pointer flex flex-col items-center justify-center gap-1">
                    <input type="file" className="hidden" accept="image/*" multiple onChange={handleUpload} />
                    <Plus size={18} className="text-gray-500" />
                    <span className="text-[9px] text-gray-600">添加</span>
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed border-gray-700 bg-gray-900/50 hover:border-indigo-500 cursor-pointer">
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleUpload} />
                  <Plus size={24} className="text-gray-400" />
                  <span className="text-[10px] text-gray-500 mt-2">点击 / 粘贴 / 拖拽参考图（可多张）</span>
                </label>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500">比例</label>
              <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatioType)} className="w-full bg-black/50 border border-gray-800 rounded-lg p-2 text-xs text-gray-300 outline-none">
                <option value="auto">✦ 自适应</option>
                <option value="1:1">1:1</option>
                <option value="3:4">3:4</option>
                <option value="4:3">4:3</option>
                <option value="9:16">9:16</option>
                <option value="16:9">16:9</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-500">画质</label>
              <select value={imageSize} onChange={(e) => setImageSize(e.target.value as ImageSizeType)} className="w-full bg-black/50 border border-gray-800 rounded-lg p-2 text-xs text-gray-300 outline-none">
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <span className="break-all">{error}</span>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-all ${isGenerating ? 'bg-gray-800 text-gray-500' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg active:scale-[0.98]'}`}
          >
            {isGenerating ? <><RefreshCw className="animate-spin" size={20} /> 正在生成...</> : <><Zap size={20} fill="currentColor" /> 立即生成</>}
          </button>

          <div className="mt-3 px-2 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300/90 space-y-1 leading-relaxed">
            <p><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="underline hover:text-indigo-200">新ICP备2024016754号-2</a></p>
            <p>本站 API 仅限合规技术研发及学术测试使用。用户须严格遵守《生成式人工智能服务管理暂行办法》，严禁利用本平台接口生成或传播违法违规内容。本平台不对用户行为承担连带法律责任。</p>
          </div>
        </div>
      </div>

      <div className="flex-1 relative flex flex-col bg-black">
        <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900/20 backdrop-blur-sm z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-[10px] font-mono text-gray-400">ONLINE</span>
            </div>
            <div className="h-4 w-[1px] bg-gray-800"></div>
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-gray-800">
              {((settings.apiConfig.apiProvider ?? 'laozhang') === 'grsai'
                ? [
                    { id: 'nano-banana-fast', label: 'Fast' },
                    { id: 'nano-banana-2', label: '2' },
                    { id: 'nano-banana-pro', label: 'Pro' },
                    { id: 'nano-banana-pro-vip', label: 'Pro VIP' },
                  ]
                : [
                    { id: 'nano-banana-2', label: 'Banana 2' },
                    { id: 'gemini-3.1-flash-image-preview', label: '3.1 Flash' },
                    { id: 'gemini-3-pro-image-preview', label: '3 Pro' },
                  ]
              ).map(m => (
                <button
                  key={m.id}
                  onClick={() => setSettings(prev => ({ ...prev, apiConfig: { ...prev.apiConfig, modelName: m.id } }))}
                  className={`px-3 py-1 rounded text-[9px] font-bold uppercase transition-all ${settings.apiConfig.modelName === m.id ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-2 px-3 py-1 rounded-full border border-gray-800 text-gray-500 text-[10px] font-bold uppercase">LOGS {showLogs ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
        </div>

        <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
          {lastResult ? (
            <div className="w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl border border-gray-800 bg-gray-900">
              {lastResult.startsWith('data:image') || lastResult.startsWith('http') ? (
                <div className="relative group">
                  <img src={lastResult} className="max-w-full max-h-[70vh] object-contain mx-auto" alt="Generated" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <button onClick={() => downloadImage(lastResult, `img-${Date.now()}.png`)} className="p-3 bg-white/10 rounded-full text-white"><Download size={24} /></button>
                    <button onClick={() => window.open(lastResult, '_blank')} className="p-3 bg-white/10 rounded-full text-white"><Maximize2 size={24} /></button>
                  </div>
                </div>
              ) : (
                <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  <div className="flex items-center gap-2 mb-4 border-b border-gray-800 pb-4"><Terminal size={16} className="text-purple-400" /><span className="text-xs font-bold text-gray-400">LLM RESPONSE</span></div>
                  <div className="text-gray-200 font-sans leading-relaxed whitespace-pre-wrap text-sm">{lastResult}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center opacity-20"><ImageIcon size={64} className="mx-auto mb-4" /><p className="text-xs uppercase tracking-widest font-bold">READY TO GENERATE</p></div>
          )}
        </div>

        {showLogs && (
          <div className="absolute bottom-0 left-0 right-0 h-64 bg-black/90 backdrop-blur-xl border-t border-gray-800 z-50 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1 custom-scrollbar">
              {logs.map((log) => (<div key={log.id} className="flex gap-3"><span className="text-gray-600">[{log.timestamp}]</span><span className={log.level === 'ERROR' ? 'text-red-500' : 'text-indigo-400'}>{log.level}</span><span className="text-gray-400">{log.message}</span></div>))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Generator;
