import React, { useEffect, useRef } from 'react';
import {
  Zap,
  Image as ImageIcon,
  RefreshCw,
  Download,
  Maximize2,
  Terminal,
  Plus,
  X,
  Camera,
  AlignLeft,
  Cpu,
  Settings as SettingsIcon,
  Film,
  Server
} from 'lucide-react';
import { AppSettings, GeneratedImage, LogEntry, AspectRatioType, ProtocolConfig } from '../types';
import { downloadImage, fileToBase64 } from '../services/geminiService';
import { generateVideo } from '../services/videoService';
import { getErrorMessage } from '../utils/errorUtils';

const VIDEO_MODEL_PRESETS = [
  { id: 'luma-v1.6',       name: 'Luma v1.6' },
  { id: 'kling-v1.5',      name: 'Kling v1.5' },
  { id: 'runway-gen3',     name: 'Runway Gen3' },
  { id: 'cogvideox-5b',    name: 'CogVideo-5B' },
  { id: 'hailuo',          name: 'Hailuo' },
];

interface VideoGeneratorProps {
  isActive: boolean;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  addLog: (entry: LogEntry) => void;
  logs: LogEntry[];
  addGeneratedImage: (img: GeneratedImage) => Promise<void>;
  showLogs: boolean;
}

const VideoGenerator: React.FC<VideoGeneratorProps> = ({
  isActive,
  settings,
  setSettings,
  addLog,
  logs,
  addGeneratedImage,
  showLogs,
}) => {
  const [prompts, setPrompts] = React.useState<string[]>(['']);
  const [refImages, setRefImages] = React.useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatioType>('16:9');
  const [duration, setDuration] = React.useState<number>(5);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const videoApiConfig = settings.videoApiConfig || { endpointUrl: '', apiKey: '', modelName: 'luma-v1.6' };
  const currentModelInPresets = VIDEO_MODEL_PRESETS.some(m => m.id === videoApiConfig.modelName);

  useEffect(() => {
    if (showLogs) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

  // 粘贴图片
  useEffect(() => {
    if (!isActive) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgItems: DataTransferItem[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) imgItems.push(items[i]);
      }
      if (imgItems.length > 0) {
        e.preventDefault();
        for (const item of imgItems) {
          const blob = item.getAsFile();
          if (blob) {
            try {
              const b64 = await fileToBase64(blob as File);
              setRefImages(prev => [...prev, b64]);
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
    if (!files?.length) return;
    for (const file of Array.from<File>(files)) {
      try {
        const b64 = await fileToBase64(file);
        setRefImages(prev => [...prev, b64]);
      } catch (e) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `上传失败 (${file.name}): ${getErrorMessage(e)}` });
      }
    }
    e.target.value = '';
  };

  const removeRefImage = (idx: number) => setRefImages(prev => prev.filter((_, i) => i !== idx));

  const addPrompt    = () => setPrompts(prev => [...prev, '']);
  const removePrompt = (idx: number) => setPrompts(prev => prev.filter((_, i) => i !== idx));
  const updatePrompt = (idx: number, val: string) => setPrompts(prev => prev.map((p, i) => i === idx ? val : p));

  const setModel = (modelId: string) =>
    setSettings(prev => ({ ...prev, videoApiConfig: { ...videoApiConfig, modelName: modelId } }));

  const setApiConfig = (key: keyof AppSettings['apiConfig'], val: string) =>
    setSettings(prev => ({ ...prev, videoApiConfig: { ...videoApiConfig, [key]: val } }));

  const handleGenerate = async () => {
    const combinedPrompt = prompts.map(p => p.trim()).filter(Boolean).join(' ');
    if (!combinedPrompt) { setError('请输入提示词'); return; }
    setIsGenerating(true);
    setError(null);
    const config = { aspectRatio, duration, customPrompt: combinedPrompt };
    const startTime = Date.now();
    addLog({ id: `start-${Date.now()}`, timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: `开始生成视频 [${videoApiConfig.modelName}]...` });

    try {
      const resultUrl = await generateVideo(config, videoApiConfig, refImages);
      setLastResult(resultUrl);
      
      // 我们在此复用 addGeneratedImage 的钩子，将其当成视频源存起来
      await addGeneratedImage({ 
        id: Date.now().toString(), 
        url: resultUrl, 
        type: 'video',
        prompt: combinedPrompt, 
        timestamp: Date.now(), 
        modelUsed: videoApiConfig.modelName, 
        parameters: config 
      });
      
      const genDur = ((Date.now() - startTime) / 1000).toFixed(1);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'SUCCESS', message: `视频生成成功，耗时 ${genDur}s` });
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      const genDur = ((Date.now() - startTime) / 1000).toFixed(1);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `视频生成失败 (耗时 ${genDur}s): ${msg}` });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (idx: number) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && idx === prompts.length - 1) {
      e.preventDefault();
      handleGenerate();
    }
  };

  if (!isActive) return null;

  return (
    <div className="h-full flex flex-row overflow-hidden">

      {/* ════════════════════════════════════════
          左侧边栏：模型列表
          ═══════════════════════════════════════ */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col overflow-hidden">

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-800/60 bg-black/20 flex-shrink-0">
            <div className="flex items-center gap-1.5 mb-2">
              <Server size={11} className="text-gray-600" />
              <span className="text-[10px] font-bold uppercase font-mono text-gray-500 tracking-wider">Video API 设置</span>
            </div>
            
            <div className="space-y-1.5 mb-2">
              <input
                type="text"
                placeholder="Endpoint URL (例如包含 /v2/videos/generations)"
                value={videoApiConfig.endpointUrl}
                onChange={e => setApiConfig('endpointUrl', e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-md px-2 py-1.5 text-[10px] text-white outline-none font-mono focus:border-indigo-500 transition-colors placeholder-gray-600"
              />
              <input
                type="text"
                placeholder="API Key (sk-...)"
                value={videoApiConfig.apiKey}
                onChange={e => setApiConfig('apiKey', e.target.value)}
                className="w-full bg-black/50 border border-gray-700 rounded-md px-2 py-1.5 text-[10px] text-white outline-none font-mono focus:border-indigo-500 transition-colors placeholder-gray-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-gray-800/60">
            <div className="flex items-center gap-1.5">
              <Cpu size={11} className="text-gray-600" />
              <span className="text-[10px] font-bold uppercase font-mono text-gray-500 tracking-wider">模型</span>
            </div>
          </div>

          {/* 模型列表及自定义输入 */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-1.5 px-2 space-y-1">
            <div className="mb-2">
              <input
                type="text"
                placeholder="或输入自定义模型..."
                value={videoApiConfig.modelName}
                onChange={e => setApiConfig('modelName', e.target.value)}
                className="w-full bg-black/40 border border-gray-700/80 rounded px-2 py-1.5 text-[10px] text-white outline-none font-mono focus:border-indigo-500 transition-colors placeholder-gray-600"
              />
            </div>

            <div className="space-y-0.5">
              {VIDEO_MODEL_PRESETS.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                title={m.id}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-colors truncate ${
                  videoApiConfig.modelName === m.id
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                {m.name}
              </button>
            ))}

            </div>
          </div>
        </div>
      </aside>

      {/* ════════════════════════════════════════
          中间主区域：预览 + 底部 Dock
          ═══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* 预览区 */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0 bg-black">
          {lastResult ? (
            <div className="relative group w-full h-full flex items-center justify-center p-6">
              <video
                src={lastResult}
                controls
                autoPlay
                loop
                className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)]"
              />
              {/* hover 操作 */}
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
                <button
                  onClick={() => downloadImage(lastResult, `video-${Date.now()}.mp4`)}
                  className="flex items-center gap-2 px-4 py-2 bg-black/70 backdrop-blur-md rounded-full text-white text-xs font-semibold border border-white/10 hover:bg-white/10 transition"
                >
                  <Download size={13} /> 下载
                </button>
                <button
                  onClick={() => window.open(lastResult, '_blank')}
                  className="flex items-center gap-2 px-4 py-2 bg-black/70 backdrop-blur-md rounded-full text-white text-xs font-semibold border border-white/10 hover:bg-white/10 transition"
                >
                  <Maximize2 size={13} /> 全屏
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center select-none pointer-events-none pb-12">
              <Film size={52} className="mx-auto mb-3 text-gray-800" />
              <p className="text-[10px] text-gray-700 uppercase tracking-[0.3em] font-bold">Ready to Generate Video</p>
            </div>
          )}

          {/* 生成中遮罩 */}
          {isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-sm">
              <RefreshCw size={26} className="animate-spin text-indigo-400" />
              <span className="text-sm font-mono text-indigo-300 tracking-widest">GENERATING...</span>
            </div>
          )}
        </div>

        {/* ════ 底部 Dock ════ */}
        <div className="flex-shrink-0 border-t border-gray-800/80 bg-gray-950">

          {/* Row 1：参考图 */}
          <div
            className="flex items-center px-4 border-b border-gray-800/60 min-h-[44px]"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              Array.from<File>(e.dataTransfer.files)
                .filter(f => f.type.startsWith('image/'))
                .forEach(f => fileToBase64(f)
                  .then(b => setRefImages(prev => [...prev, b]))
                  .catch(err => addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `拖拽失败: ${getErrorMessage(err)}` })));
            }}
          >
            <div className="flex items-center gap-1.5 text-gray-600 shrink-0 w-20">
              <Camera size={12} />
              <span className="text-[10px] font-bold uppercase font-mono">参考图</span>
            </div>
            <div className="w-px h-4 bg-gray-800 shrink-0 mr-3" />
            <div className="flex-1 flex items-center gap-2 overflow-x-auto custom-scrollbar py-1.5">
              {refImages.map((src, idx) => (
                <div key={idx} className="relative shrink-0 w-7 h-7 rounded-md overflow-hidden border border-gray-700 group/thumb">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeRefImage(idx)}
                    className="absolute inset-0 bg-black/70 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <X size={10} className="text-white" />
                  </button>
                </div>
              ))}
              <label className="shrink-0 w-7 h-7 rounded-md border border-dashed border-gray-700 hover:border-indigo-500/70 cursor-pointer flex items-center justify-center bg-gray-900/50 transition-colors group/add">
                <input type="file" className="hidden" accept="image/*" multiple onChange={handleUpload} />
                <Plus size={13} className="text-gray-600 group-hover/add:text-indigo-400 transition-colors" />
              </label>
              {refImages.length === 0 && (
                <span className="text-[10px] text-gray-700 font-mono ml-1 select-none">粘贴 / 点击 / 拖拽...</span>
              )}
            </div>
          </div>

          {/* Row 2：提示词（多段动态） */}
          <div className="border-b border-gray-800/60">
            {prompts.map((p, idx) => (
              <div key={idx} className={`flex items-end px-4 py-2 ${idx > 0 ? 'border-t border-gray-800/40' : ''}`}>
                {/* 左标签 */}
                <div className="flex items-center gap-1 text-gray-600 shrink-0 w-20 pb-0.5">
                  {idx === 0 ? (
                    <>
                      <AlignLeft size={12} />
                      <span className="text-[10px] font-bold uppercase font-mono">提示词</span>
                      <button
                        onClick={addPrompt}
                        className="ml-1 text-gray-700 hover:text-indigo-400 transition-colors"
                        title="新增提示词段"
                      >
                        <Plus size={11} />
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] font-mono text-gray-700 pl-4">#{idx + 1}</span>
                  )}
                </div>
                <div className="w-px h-4 bg-gray-800 shrink-0 mr-3 mb-0.5" />

                <textarea
                  value={p}
                  onChange={e => updatePrompt(idx, e.target.value)}
                  onKeyDown={handleKeyDown(idx)}
                  placeholder={idx === 0
                    ? '描述你想生成的图像...（Enter 生成 · Shift+Enter 换行）'
                    : '追加补充描述...'}
                  rows={idx === 0 ? 2 : 1}
                  className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-700 outline-none resize-none leading-relaxed py-0.5 font-sans"
                />

                {idx === 0 ? (
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`shrink-0 ml-4 flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-sm transition-all ${
                      isGenerating
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.35)] active:scale-[0.97]'
                    }`}
                  >
                    {isGenerating ? <RefreshCw size={15} className="animate-spin" /> : <Zap size={15} fill="currentColor" />}
                    {isGenerating ? '生成中' : '生成'}
                  </button>
                ) : (
                  <button
                    onClick={() => removePrompt(idx)}
                    className="shrink-0 ml-3 mb-0.5 p-1 rounded-md text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="删除此段"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Row 3：参数 + 错误 */}
          <div className="flex items-center gap-3 px-4 py-2 min-h-[36px]">
            <select
              value={aspectRatio}
              onChange={e => setAspectRatio(e.target.value as AspectRatioType)}
              className="bg-transparent text-[10px] text-gray-500 outline-none cursor-pointer hover:text-gray-300 transition-colors font-mono"
            >
              <option value="auto">比例: 自适应</option>
              <option value="1:1">比例: 1:1</option>
              <option value="3:4">比例: 3:4</option>
              <option value="4:3">比例: 4:3</option>
              <option value="9:16">比例: 9:16</option>
              <option value="16:9">比例: 16:9</option>
            </select>

            <div className="w-px h-3 bg-gray-800 shrink-0" />

            <select
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="bg-transparent text-[10px] text-gray-500 outline-none cursor-pointer hover:text-gray-300 transition-colors font-mono"
            >
              <option value="5">时长: 5s</option>
              <option value="10">时长: 10s</option>
            </select>

            {error && (
              <>
                <div className="w-px h-3 bg-gray-800 shrink-0" />
                <span className="text-[10px] text-red-400 font-mono truncate flex-1">{error}</span>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ════════════════════════════════════════
          右侧 Logs 栏（showLogs 时展开）
          ═══════════════════════════════════════ */}
      {showLogs && (
        <aside className="w-56 flex-shrink-0 border-l border-gray-800 bg-gray-900/40 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-800/60 flex-shrink-0">
            <Terminal size={11} className="text-indigo-400" />
            <span className="text-[10px] font-bold text-gray-500 uppercase font-mono tracking-wider">Logs</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 custom-scrollbar">
            {logs.map(log => (
              <div key={log.id} className="text-[9px] leading-[14px]">
                <div className="flex gap-1.5 items-baseline flex-wrap">
                  <span className={`font-bold shrink-0 ${
                    log.level === 'ERROR' ? 'text-red-500' :
                    log.level === 'SUCCESS' ? 'text-green-500' : 'text-indigo-400'
                  }`}>{log.level}</span>
                  <span className="text-gray-700 shrink-0">{log.timestamp}</span>
                </div>
                <p className="text-gray-500 break-all pl-0.5 mt-0.5">{log.message}</p>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </aside>
      )}

    </div>
  );
};

export default VideoGenerator;
