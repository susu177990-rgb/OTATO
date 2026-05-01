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
  Save,
  Trash2,
  Pencil
} from 'lucide-react';
import { AppSettings, GeneratedImage, LogEntry, AspectRatioType, ProtocolConfig, CustomModelConfig } from '../types';
import { downloadImage, fileToBase64 } from '../services/geminiService';
import { generateVideo, queryVideoTask } from '../services/videoService';
import { getErrorMessage } from '../utils/errorUtils';
import { KLING_MOTION_CONTROL_ENDPOINT, WAN_ANIMATE_MOVE_ENDPOINT } from '../constants';

const VIDEO_MODEL_PRESETS = [
  { id: 'kling-video-motion-control', name: 'Kling 动作迁移' },
  { id: 'wan2.2-animate-move', name: 'Wan2.2 图生动作' },
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
  const [motionImageUrl, setMotionImageUrl] = React.useState('');
  const [motionVideoFile, setMotionVideoFile] = React.useState<File | null>(null);
  const [motionMode, setMotionMode] = React.useState('pro');
  const [characterOrientation, setCharacterOrientation] = React.useState<'image' | 'video'>('video');
  const [resumeTaskId, setResumeTaskId] = React.useState('');
  const [isRecovering, setIsRecovering] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showAddModel, setShowAddModel] = React.useState(false);
  const [editingModelId, setEditingModelId] = React.useState<string | null>(null);
  const [newModel, setNewModel] = React.useState({ name: '', modelName: '', endpointUrl: '', apiKey: '' });
  const logEndRef = useRef<HTMLDivElement>(null);

  const videoApiConfig = settings.videoApiConfig || { endpointUrl: '', apiKey: '', modelName: 'luma-v1.6' };
  const isKlingMotionControlModel =
    videoApiConfig.modelName === 'kling-video-motion-control' ||
    videoApiConfig.endpointUrl.includes('/kling/v1/videos/motion-control');
  const isWanAnimateMoveModel =
    videoApiConfig.modelName === 'wan2.2-animate-move' ||
    videoApiConfig.endpointUrl.includes('/qwen/api/v1/services/aigc/image2video/video-synthesis');
  const isMotionControlModel = isKlingMotionControlModel || isWanAnimateMoveModel;

  useEffect(() => {
    if (showLogs) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

  useEffect(() => {
    if (isKlingMotionControlModel && !['std', 'pro'].includes(motionMode)) {
      setMotionMode('pro');
    }
    if (isWanAnimateMoveModel && !['wan-std', 'wan-pro'].includes(motionMode)) {
      setMotionMode('wan-pro');
    }
  }, [isKlingMotionControlModel, isWanAnimateMoveModel, motionMode]);

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

  const handleMotionVideoUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      addLog({
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        level: 'ERROR',
        message: `动作视频格式不支持 (${file.name})，请上传 mp4 / mov / avi 等视频文件`
      });
      return;
    }
    setMotionVideoFile(file);
  };

  const clearMotionVideo = () => setMotionVideoFile(null);

  const removeRefImage = (idx: number) => setRefImages(prev => prev.filter((_, i) => i !== idx));

  const addPrompt    = () => setPrompts(prev => [...prev, '']);
  const removePrompt = (idx: number) => setPrompts(prev => prev.filter((_, i) => i !== idx));
  const updatePrompt = (idx: number, val: string) => setPrompts(prev => prev.map((p, i) => i === idx ? val : p));

  const getEndpointForModel = (modelId: string, currentEndpoint: string): string => {
    if (modelId === 'kling-video-motion-control') return KLING_MOTION_CONTROL_ENDPOINT;
    if (modelId === 'wan2.2-animate-move') return WAN_ANIMATE_MOVE_ENDPOINT;
    return currentEndpoint;
  };

const setModel = (modelId: string) => {
    const preset = VIDEO_MODEL_PRESETS.find(m => m.id === modelId);
    setSettings(prev => {
      let newEndpointUrl = prev.savedUrls?.[modelId] ?? (preset ? getEndpointForModel(modelId, videoApiConfig.endpointUrl) : prev.videoApiConfig.endpointUrl);
      const newApiKey = prev.savedApiKeys?.[modelId] ?? '';
      return {
        ...prev,
        videoApiConfig: {
          ...prev.videoApiConfig,
          modelName: modelId,
          presetId: modelId,
          endpointUrl: newEndpointUrl,
          apiKey: newApiKey
        }
      };
    });
  };

  const setApiConfig = (key: keyof AppSettings['apiConfig'], val: string) => {
    setSettings(prev => {
      const nextVideoApiConfig = { ...prev.videoApiConfig, [key]: val };
      let nextSavedApiKeys = prev.savedApiKeys || {};
      let nextSavedUrls = prev.savedUrls || {};
      const memoryKey = prev.videoApiConfig.presetId || prev.videoApiConfig.modelName;
      if (key === 'apiKey') {
        nextSavedApiKeys = { ...nextSavedApiKeys, [memoryKey]: val };
      } else if (key === 'endpointUrl') {
        nextSavedUrls = { ...nextSavedUrls, [memoryKey]: val };
      }
      return {
        ...prev,
        videoApiConfig: nextVideoApiConfig,
        savedApiKeys: nextSavedApiKeys,
        savedUrls: nextSavedUrls
      };
    });
  };

  const handleSaveCustomModel = () => {
    if (!newModel.name || !newModel.modelName || !newModel.endpointUrl) {
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: '请填写模型名称、模型名和API地址' });
      return;
    }
    const modelId = editingModelId || `custom-${Date.now()}`;
    const customModel: CustomModelConfig = {
      id: modelId,
      name: newModel.name,
      modelName: newModel.modelName,
      endpointUrl: newModel.endpointUrl,
      apiKey: newModel.apiKey
    };
    setSettings(prev => {
      const videoCustomModels = editingModelId
        ? (prev.videoCustomModels || []).map(m => m.id === editingModelId ? customModel : m)
        : [...(prev.videoCustomModels || []), customModel];
      const isSelected = prev.videoApiConfig?.presetId === modelId;

      return {
        ...prev,
        videoCustomModels,
        videoApiConfig: isSelected
          ? {
              ...prev.videoApiConfig,
              modelName: customModel.modelName,
              endpointUrl: customModel.endpointUrl,
              apiKey: customModel.apiKey,
            }
          : prev.videoApiConfig,
        savedUrls: { ...prev.savedUrls, [modelId]: newModel.endpointUrl },
        savedApiKeys: { ...prev.savedApiKeys, [modelId]: newModel.apiKey }
      };
    });
    addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'SUCCESS', message: editingModelId ? `自定义模型「${newModel.name}」已更新` : `自定义模型「${newModel.name}」已保存` });
    setNewModel({ name: '', modelName: '', endpointUrl: '', apiKey: '' });
    setEditingModelId(null);
    setShowAddModel(false);
  };

  const handleEditCustomModel = (model: CustomModelConfig) => {
    setEditingModelId(model.id);
    setNewModel({
      name: model.name,
      modelName: model.modelName,
      endpointUrl: model.endpointUrl,
      apiKey: model.apiKey || settings.savedApiKeys?.[model.id] || '',
    });
    setShowAddModel(true);
  };

  const handleCancelEditCustomModel = () => {
    setEditingModelId(null);
    setNewModel({ name: '', modelName: '', endpointUrl: '', apiKey: '' });
    setShowAddModel(false);
  };

  const handleDeleteCustomModel = (modelId: string) => {
    setSettings(prev => ({
      ...prev,
      videoCustomModels: (prev.videoCustomModels || []).filter(m => m.id !== modelId)
    }));
    addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: `自定义模型已删除` });
  };

  const setCustomModel = (model: CustomModelConfig) => {
    setSettings(prev => ({
      ...prev,
      videoApiConfig: {
        ...prev.videoApiConfig,
        modelName: model.modelName,
        presetId: model.id,
        endpointUrl: model.endpointUrl,
        apiKey: model.apiKey || prev.savedApiKeys?.[model.id] || ''
      }
    }));
  };

  const handleGenerate = async () => {
    const combinedPrompt = prompts.map(p => p.trim()).filter(Boolean).join(' ');
    if (!isMotionControlModel && !combinedPrompt) { setError('请输入提示词'); return; }
    if (isKlingMotionControlModel && refImages.length === 0) { setError('请至少提供一张角色图'); return; }
    if (isWanAnimateMoveModel && refImages.length === 0 && !motionImageUrl.trim()) { setError('请上传、粘贴角色图，或填写角色图 URL'); return; }
    if (isMotionControlModel && !motionVideoFile) { setError('请上传动作视频'); return; }
    setIsGenerating(true);
    setError(null);
    const config = {
      aspectRatio,
      duration,
      customPrompt: combinedPrompt,
      motionImageUrl: motionImageUrl.trim(),
      motionMode,
      characterOrientation,
      motionVideoName: motionVideoFile?.name || '',
    };
    const startTime = Date.now();
    addLog({ id: `start-${Date.now()}`, timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: `开始生成视频 [${videoApiConfig.modelName}]...` });

    try {
      const resultUrl = await generateVideo(config, videoApiConfig, refImages, motionVideoFile || undefined);
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

  const handleRecoverTask = async () => {
    const taskId = resumeTaskId.trim();
    if (!taskId) {
      setError('请输入要恢复查询的 task_id');
      return;
    }

    setIsRecovering(true);
    setError(null);
    addLog({
      id: `resume-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      message: `开始查询任务 ${taskId}...`
    });

    try {
      const result = await queryVideoTask(taskId, videoApiConfig);
      if (result.outputUrl) {
        setLastResult(result.outputUrl);
        await addGeneratedImage({
          id: taskId,
          url: result.outputUrl,
          type: 'video',
          prompt: `Recovered task ${taskId}`,
          timestamp: Date.now(),
          modelUsed: videoApiConfig.modelName,
          parameters: {
            recoveredFromTaskId: taskId,
            taskStatus: result.status,
          }
        });
        addLog({
          id: `resume-success-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          level: 'SUCCESS',
          message: `任务 ${taskId} 已恢复，视频结果已补回画廊`
        });
        return;
      }

      if (result.status === 'FAILED' || result.status === 'FAIL' || result.status === 'CANCELED' || result.status === 'CANCELLED') {
        throw new Error(`任务 ${taskId} 已失败，当前状态：${result.status}`);
      }

      addLog({
        id: `resume-pending-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: 'INFO',
        message: `任务 ${taskId} 当前状态：${result.status}，尚未返回视频结果`
      });
      setError(`任务 ${taskId} 当前状态：${result.status}`);
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      addLog({
        id: `resume-error-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: 'ERROR',
        message: `恢复任务失败: ${msg}`
      });
    } finally {
      setIsRecovering(false);
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
  <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-gray-800/60">
    <div className="flex items-center gap-1.5">
      <Cpu size={11} className="text-gray-600" />
      <span className="text-[10px] font-bold uppercase font-mono text-gray-500 tracking-wider">模型</span>
    </div>
    <button
      onClick={() => {
        if (showAddModel) {
          handleCancelEditCustomModel();
        } else {
          setShowAddModel(true);
        }
      }}
      className="p-1 rounded hover:bg-gray-800/60 text-gray-500 hover:text-indigo-400 transition-colors"
      title="添加自定义模型"
    >
      <Plus size={13} />
    </button>
  </div>

  {showAddModel && (
    <div className="px-2 py-2 border-b border-gray-800/60 bg-black/20 space-y-1.5">
      <input
        type="text"
        placeholder="显示名称"
        value={newModel.name}
        onChange={e => setNewModel(prev => ({ ...prev, name: e.target.value }))}
        className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-white outline-none font-mono focus:border-indigo-500 placeholder-gray-600"
      />
      <input
        type="text"
        placeholder="模型名"
        value={newModel.modelName}
        onChange={e => setNewModel(prev => ({ ...prev, modelName: e.target.value }))}
        className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-white outline-none font-mono focus:border-indigo-500 placeholder-gray-600"
      />
      <input
        type="text"
        placeholder="API 地址"
        value={newModel.endpointUrl}
        onChange={e => setNewModel(prev => ({ ...prev, endpointUrl: e.target.value }))}
        className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-white outline-none font-mono focus:border-indigo-500 placeholder-gray-600"
      />
      <input
        type="text"
        placeholder="API Key (可选)"
        value={newModel.apiKey}
        onChange={e => setNewModel(prev => ({ ...prev, apiKey: e.target.value }))}
        className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-white outline-none font-mono focus:border-indigo-500 placeholder-gray-600"
      />
      <button
        onClick={handleSaveCustomModel}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded text-[10px] font-bold transition-colors"
      >
        <Save size={10} /> {editingModelId ? '更新模型' : '保存模型'}
      </button>
      {editingModelId && (
        <button
          onClick={handleCancelEditCustomModel}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-400 rounded text-[10px] font-bold transition-colors"
        >
          <X size={10} /> 取消编辑
        </button>
      )}
    </div>
  )}

  <div className="flex-1 overflow-y-auto custom-scrollbar py-1.5 px-2 space-y-1">
    {settings.videoCustomModels && settings.videoCustomModels.length > 0 && (
      <div className="space-y-0.5">
        {settings.videoCustomModels.map(m => {
          const isSelected = settings.videoApiConfig?.presetId === m.id;
          return (
            <div key={m.id} className="group flex items-center">
              <button
                onClick={() => setCustomModel(m)}
                title={`${m.name}\n${m.endpointUrl}`}
                className={`flex-1 text-left px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-colors truncate ${
                  isSelected
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/20'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                }`}
              >
                {m.name}
              </button>
              <button
                onClick={() => handleEditCustomModel(m)}
                className="p-1 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-indigo-400 transition-all"
                title="编辑"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => handleDeleteCustomModel(m.id)}
                className="p-1 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                title="删除"
              >
                <Trash2 size={10} />
              </button>
            </div>
          );
        })}
      </div>
    )}

    <div className="space-y-0.5 pt-1 border-t border-gray-800/40">
      {VIDEO_MODEL_PRESETS.map(m => {
        const isSelected = settings.videoApiConfig?.presetId === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setModel(m.id)}
            title={m.id}
            className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-colors truncate ${
              isSelected
              ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/20'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
            }`}
          >
            {m.name}
          </button>
        );
      })}
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
              <span className="text-[10px] font-bold uppercase font-mono">
                {isMotionControlModel ? '角色图' : '参考图'}
              </span>
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
                <span className="text-[10px] text-gray-700 font-mono ml-1 select-none">
                  {isWanAnimateMoveModel
                    ? '角色图: 粘贴 / 点击 / 拖拽...（或下方填 URL）'
                    : isMotionControlModel
                      ? '角色图: 粘贴 / 点击 / 拖拽...'
                      : '粘贴 / 点击 / 拖拽...'}
                </span>
              )}
            </div>
          </div>

          {isWanAnimateMoveModel && (
            <div className="flex items-center px-4 border-b border-gray-800/60 min-h-[44px]">
              <div className="flex items-center gap-1.5 text-gray-600 shrink-0 w-20">
                <Camera size={12} />
                <span className="text-[10px] font-bold uppercase font-mono">角色图 URL</span>
              </div>
              <div className="w-px h-4 bg-gray-800 shrink-0 mr-3" />
              <input
                type="text"
                value={motionImageUrl}
                onChange={e => setMotionImageUrl(e.target.value)}
                placeholder="可选：填写公网角色图 URL；留空则使用本地上传/粘贴图片"
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-700 outline-none py-2 font-sans"
              />
            </div>
          )}

          {isMotionControlModel && (
            <div
              className="flex items-center px-4 border-b border-gray-800/60 min-h-[44px]"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                handleMotionVideoUpload(e.dataTransfer.files);
              }}
            >
              <div className="flex items-center gap-1.5 text-gray-600 shrink-0 w-20">
                <Film size={12} />
                <span className="text-[10px] font-bold uppercase font-mono">动作视频</span>
              </div>
              <div className="w-px h-4 bg-gray-800 shrink-0 mr-3" />
              <div className="flex-1 flex items-center gap-2 min-w-0 py-1.5">
                {motionVideoFile ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-200 truncate">{motionVideoFile.name}</div>
                      <div className="text-[10px] text-gray-600 font-mono">
                        {(motionVideoFile.size / 1024 / 1024).toFixed(1)} MB
                      </div>
                    </div>
                    <button
                      onClick={clearMotionVideo}
                      className="shrink-0 p-1 rounded-md text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="移除动作视频"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-600 truncate">点击或拖拽上传本地动作视频（mp4 / mov / avi）</span>
                    <label className="shrink-0 px-3 py-1.5 rounded-md border border-dashed border-gray-700 hover:border-indigo-500/70 cursor-pointer bg-gray-900/50 text-[11px] text-gray-300 transition-colors">
                      选择文件
                      <input
                        type="file"
                        className="hidden"
                        accept="video/*,.mp4,.mov,.avi"
                        onChange={e => {
                          handleMotionVideoUpload(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          )}

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
                    ? (isMotionControlModel
                      ? '可选：描述动作迁移后的镜头、风格或质量要求...（Enter 生成 · Shift+Enter 换行）'
                      : '描述你想生成的图像...（Enter 生成 · Shift+Enter 换行）')
                    : (isMotionControlModel ? '追加补充动作要求...' : '追加补充描述...')}
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

          {isMotionControlModel && (
            <div className="flex items-center px-4 border-b border-gray-800/60 min-h-[44px]">
              <div className="flex items-center gap-1.5 text-gray-600 shrink-0 w-20">
                <RefreshCw size={12} />
                <span className="text-[10px] font-bold uppercase font-mono">恢复任务</span>
              </div>
              <div className="w-px h-4 bg-gray-800 shrink-0 mr-3" />
              <input
                type="text"
                value={resumeTaskId}
                onChange={e => setResumeTaskId(e.target.value)}
                placeholder="输入已有 task_id，重新查询并补回结果"
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-700 outline-none py-2 font-mono"
              />
              <button
                onClick={handleRecoverTask}
                disabled={isRecovering}
                className={`shrink-0 ml-3 px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${
                  isRecovering
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                {isRecovering ? '查询中' : '按任务恢复'}
              </button>
            </div>
          )}

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
<option value="21:9">比例: 21:9</option>
            </select>

            <div className="w-px h-3 bg-gray-800 shrink-0" />

            {isMotionControlModel ? (
              <>
                <select
                  value={motionMode}
                  onChange={e => setMotionMode(e.target.value)}
                  className="bg-transparent text-[10px] text-gray-500 outline-none cursor-pointer hover:text-gray-300 transition-colors font-mono"
                >
                  {isKlingMotionControlModel ? (
                    <>
                      <option value="std">模式: 标准</option>
                      <option value="pro">模式: 专业</option>
                    </>
                  ) : (
                    <>
                      <option value="wan-std">模式: Wan 标准</option>
                      <option value="wan-pro">模式: Wan 专业</option>
                    </>
                  )}
                </select>
                {isKlingMotionControlModel ? (
                  <>
                    <div className="w-px h-3 bg-gray-800 shrink-0" />
                    <select
                      value={characterOrientation}
                      onChange={e => setCharacterOrientation(e.target.value as 'image' | 'video')}
                      className="bg-transparent text-[10px] text-gray-500 outline-none cursor-pointer hover:text-gray-300 transition-colors font-mono"
                    >
                      <option value="image">朝向: 跟随角色图</option>
                      <option value="video">朝向: 跟随动作视频</option>
                    </select>
                  </>
                ) : null}
              </>
            ) : (
              <select
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="bg-transparent text-[10px] text-gray-500 outline-none cursor-pointer hover:text-gray-300 transition-colors font-mono"
              >
                <option value="5">时长: 5s</option>
                <option value="10">时长: 10s</option>
              </select>
            )}

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
