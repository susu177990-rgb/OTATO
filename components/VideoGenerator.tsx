import React, { useEffect, useRef } from 'react';
import {
  Zap,
  RefreshCw,
  Download,
  Maximize2,
  Terminal,
  Plus,
  X,
  Camera,
  AlignLeft,
  Cpu,
  Film,
  Save,
  Trash2,
  Pencil
} from 'lucide-react';
import { AppSettings, GeneratedImage, LogEntry, AspectRatioType, ProtocolConfig, CustomModelConfig, VideoModeType, VideoResolutionType } from '../types';
import { downloadImage, fileToBase64 } from '../services/geminiService';
import { generateVideo, queryVideoTask } from '../services/videoService';
import { getErrorMessage } from '../utils/errorUtils';
import { KLING_MOTION_CONTROL_ENDPOINT } from '../constants';

const KLING_MOTION_CONTROL_MODEL_ID = 'kling-video-motion-control';
const VIDEO_MODEL_PRESETS: Array<{ id: string; name: string; videoMode: VideoModeType }> = [
  { id: KLING_MOTION_CONTROL_MODEL_ID, name: 'Kling 动作迁移', videoMode: 'motion-transfer' },
];

const getVideoModeLabel = (mode?: VideoModeType): string => {
  if (mode === 'motion-transfer') return '动作迁移';
  if (mode === 'image-to-video') return '图生视频';
  return '首尾帧';
};

const isSeedanceModel = (modelName = ''): boolean => /seedance/i.test(modelName);

const isVeoModel = (modelName = ''): boolean => /veo/i.test(modelName);

const isVeo31Model = (modelName = ''): boolean => /veo3\.1/i.test(modelName);

const isSeedance15Model = (modelName = ''): boolean => /seedance-1-5/i.test(modelName);

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
  const [videoResolution, setVideoResolution] = React.useState<VideoResolutionType>('auto');
  const [veoEnhancePrompt, setVeoEnhancePrompt] = React.useState(false);
  const [veoUpsample, setVeoUpsample] = React.useState(false);
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
  const [newModel, setNewModel] = React.useState<{ name: string; modelName: string; endpointUrl: string; apiKey: string; videoMode: VideoModeType }>({
    name: '',
    modelName: '',
    endpointUrl: '',
    apiKey: '',
    videoMode: 'first-last-frame'
  });
  const logEndRef = useRef<HTMLDivElement>(null);

  const videoApiConfig = settings.videoApiConfig || {
    endpointUrl: KLING_MOTION_CONTROL_ENDPOINT,
    apiKey: '',
    modelName: KLING_MOTION_CONTROL_MODEL_ID,
    presetId: KLING_MOTION_CONTROL_MODEL_ID,
    videoMode: 'motion-transfer'
  };
  const selectedVideoModel = [
    ...VIDEO_MODEL_PRESETS,
    ...(settings.videoCustomModels || []),
  ].find(m => m.id === videoApiConfig.presetId);
  const configuredVideoMode = videoApiConfig.videoMode || selectedVideoModel?.videoMode;
  const currentVideoMode: VideoModeType =
    configuredVideoMode === 'image-to-video' && isVeo31Model(videoApiConfig.modelName)
      ? 'first-last-frame'
      :
    configuredVideoMode ||
    (videoApiConfig.modelName === KLING_MOTION_CONTROL_MODEL_ID || videoApiConfig.endpointUrl.includes('/kling/v1/videos/motion-control')
      ? 'motion-transfer'
      : 'first-last-frame');
  const isKlingMotionControlModel =
    videoApiConfig.modelName === KLING_MOTION_CONTROL_MODEL_ID ||
    videoApiConfig.endpointUrl.includes('/kling/v1/videos/motion-control');
  const isMotionControlModel = currentVideoMode === 'motion-transfer';
  const isFirstLastFrameMode = currentVideoMode === 'first-last-frame';
  const isImageToVideoMode = currentVideoMode === 'image-to-video';
  const isVeoGenerationMode = isVeoModel(videoApiConfig.modelName) && (isFirstLastFrameMode || isImageToVideoMode);
  const supportsVideoResolution =
    (isFirstLastFrameMode && !isVeoModel(videoApiConfig.modelName) && (!isSeedanceModel(videoApiConfig.modelName) || isSeedance15Model(videoApiConfig.modelName))) ||
    (isImageToVideoMode && isSeedance15Model(videoApiConfig.modelName));
  const videoResolutionOptions: Array<{ value: VideoResolutionType; label: string }> = isSeedanceModel(videoApiConfig.modelName)
    ? [
        { value: '480p', label: '480p' },
        { value: '720p', label: '720p' },
        { value: '1080p', label: '1080p' },
      ]
    : [
        { value: '480P', label: '480P' },
        { value: '720P', label: '720P' },
        { value: '780P', label: '780P' },
        { value: '1080P', label: '1080P' },
      ];
  const effectiveVideoResolution = videoResolutionOptions.some(option => option.value === videoResolution)
    ? videoResolution
    : 'auto';

  useEffect(() => {
    if (showLogs) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, showLogs]);

  useEffect(() => {
    if (!['std', 'pro'].includes(motionMode)) {
      setMotionMode('pro');
    }
  }, [motionMode]);

  useEffect(() => {
    if (!isActive) return;
    const selectedBuiltInModel = VIDEO_MODEL_PRESETS.some(m => m.id === videoApiConfig.presetId);
    const selectedCustomModel = (settings.videoCustomModels || []).some(m => m.id === videoApiConfig.presetId);

    if (
      (selectedBuiltInModel || selectedCustomModel) &&
      videoApiConfig.endpointUrl
    ) {
      return;
    }

    setSettings(prev => {
      const currentConfig = prev.videoApiConfig || videoApiConfig;
      const endpointUrl = currentConfig.endpointUrl?.includes('/kling/v1/videos/motion-control')
        ? currentConfig.endpointUrl
        : (prev.savedUrls?.[KLING_MOTION_CONTROL_MODEL_ID] || KLING_MOTION_CONTROL_ENDPOINT);

      return {
        ...prev,
        videoApiConfig: {
          ...currentConfig,
          endpointUrl,
          modelName: KLING_MOTION_CONTROL_MODEL_ID,
          presetId: KLING_MOTION_CONTROL_MODEL_ID,
          videoMode: 'motion-transfer',
        }
      };
    });
  }, [isActive, setSettings, settings.videoCustomModels, videoApiConfig]);

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
              setRefImages(prev => {
                if (currentVideoMode === 'first-last-frame') {
                  const next = [...prev];
                  if (!next[0]) next[0] = b64;
                  else if (!next[1]) next[1] = b64;
                  else next[0] = b64;
                  return next.slice(0, 2);
                }
                if (currentVideoMode === 'image-to-video') return [b64];
                return [...prev, b64];
              });
            } catch (e) {
              addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `粘贴参考图失败: ${getErrorMessage(e)}` });
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isActive, currentVideoMode]);

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

  const handleFrameUpload = async (files: FileList | null, frameIndex: 0 | 1) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setRefImages(prev => {
        if (currentVideoMode === 'image-to-video') return [b64];
        const next = [...prev];
        next[frameIndex] = b64;
        return next.slice(0, 2);
      });
    } catch (e) {
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `上传失败 (${file.name}): ${getErrorMessage(e)}` });
    }
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

  const setModel = (modelId: string) => {
    const preset = VIDEO_MODEL_PRESETS.find(m => m.id === modelId);
    setSettings(prev => {
      const currentConfig = prev.videoApiConfig || videoApiConfig;
      const newEndpointUrl = prev.savedUrls?.[modelId] || currentConfig.endpointUrl || KLING_MOTION_CONTROL_ENDPOINT;
      const newApiKey = prev.savedApiKeys?.[modelId] ?? currentConfig.apiKey ?? '';
      return {
        ...prev,
        videoApiConfig: {
          ...currentConfig,
          modelName: modelId,
          presetId: modelId,
          endpointUrl: newEndpointUrl,
          apiKey: newApiKey,
          videoMode: preset?.videoMode || 'motion-transfer'
        }
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
      apiKey: newModel.apiKey,
      videoMode: newModel.videoMode,
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
              videoMode: customModel.videoMode,
            }
          : prev.videoApiConfig,
        savedUrls: { ...prev.savedUrls, [modelId]: newModel.endpointUrl },
        savedApiKeys: { ...prev.savedApiKeys, [modelId]: newModel.apiKey }
      };
    });

    addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'SUCCESS', message: editingModelId ? `自定义模型「${newModel.name}」已更新` : `自定义模型「${newModel.name}」已保存` });
    setNewModel({ name: '', modelName: '', endpointUrl: '', apiKey: '', videoMode: 'first-last-frame' });
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
      videoMode: model.videoMode || 'first-last-frame',
    });
    setShowAddModel(true);
  };

  const handleCancelEditCustomModel = () => {
    setEditingModelId(null);
    setNewModel({ name: '', modelName: '', endpointUrl: '', apiKey: '', videoMode: 'first-last-frame' });
    setShowAddModel(false);
  };

  const handleDeleteCustomModel = (modelId: string) => {
    setSettings(prev => ({
      ...prev,
      videoCustomModels: (prev.videoCustomModels || []).filter(m => m.id !== modelId),
      videoApiConfig: prev.videoApiConfig?.presetId === modelId
        ? {
            ...prev.videoApiConfig,
            modelName: KLING_MOTION_CONTROL_MODEL_ID,
            presetId: KLING_MOTION_CONTROL_MODEL_ID,
            endpointUrl: prev.savedUrls?.[KLING_MOTION_CONTROL_MODEL_ID] || KLING_MOTION_CONTROL_ENDPOINT,
            apiKey: prev.savedApiKeys?.[KLING_MOTION_CONTROL_MODEL_ID] || '',
            videoMode: 'motion-transfer'
          }
        : prev.videoApiConfig
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
        apiKey: model.apiKey || prev.savedApiKeys?.[model.id] || '',
        videoMode: model.videoMode || 'first-last-frame'
      }
    }));
  };

  const handleGenerate = async () => {
    const combinedPrompt = prompts.map(p => p.trim()).filter(Boolean).join(' ');
    if ((isFirstLastFrameMode || isImageToVideoMode) && !combinedPrompt) { setError('请输入提示词'); return; }
    if (isFirstLastFrameMode && !refImages[0]) { setError(isVeoModel(videoApiConfig.modelName) ? '请至少提供首帧图' : '请提供首帧图和尾帧图'); return; }
    if (isFirstLastFrameMode && !isVeoModel(videoApiConfig.modelName) && !refImages[1]) { setError('请提供首帧图和尾帧图'); return; }
    if (isImageToVideoMode && !refImages[0]) { setError('请提供参考图'); return; }
    if (isMotionControlModel && refImages.length === 0) { setError('请至少提供一张角色图'); return; }
    if (isMotionControlModel && !motionVideoFile) { setError('请上传动作视频'); return; }
    setIsGenerating(true);
    setError(null);
    const config = {
      aspectRatio,
      duration,
      videoResolution: effectiveVideoResolution,
      enhancePrompt: veoEnhancePrompt,
      enableUpsample: veoUpsample,
      customPrompt: combinedPrompt,
      videoMode: currentVideoMode,
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
          左侧边栏：设置 + 模型 + 操作
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
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setNewModel(prev => ({ ...prev, videoMode: 'first-last-frame' }))}
                className={`px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${
                  newModel.videoMode === 'first-last-frame'
                    ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/20'
                    : 'bg-black/30 text-gray-500 border border-gray-800 hover:text-gray-300'
                }`}
              >
                首尾帧
              </button>
              <button
                type="button"
                onClick={() => setNewModel(prev => ({ ...prev, videoMode: 'image-to-video' }))}
                className={`px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${
                  newModel.videoMode === 'image-to-video'
                    ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/20'
                    : 'bg-black/30 text-gray-500 border border-gray-800 hover:text-gray-300'
                }`}
              >
                图生视频
              </button>
              <button
                type="button"
                onClick={() => setNewModel(prev => ({ ...prev, videoMode: 'motion-transfer' }))}
                className={`px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${
                  newModel.videoMode === 'motion-transfer'
                    ? 'bg-indigo-600/25 text-indigo-300 border border-indigo-500/20'
                    : 'bg-black/30 text-gray-500 border border-gray-800 hover:text-gray-300'
                }`}
              >
                动作迁移
              </button>
            </div>
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
                      title={`${m.name}\n${m.endpointUrl}\n${getVideoModeLabel(m.videoMode)}`}
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

          <div className="space-y-0.5">
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

        <div className="flex-shrink-0 border-t border-gray-800/60 bg-gray-950/50 flex flex-col">
          {isFirstLastFrameMode ? (
            <div
              className="px-3 py-2 border-b border-gray-800/40"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                Array.from<File>(e.dataTransfer.files)
                  .filter(f => f.type.startsWith('image/'))
                  .slice(0, 2)
                  .forEach((f, idx) => fileToBase64(f)
                    .then(b => setRefImages(prev => {
                      const next = [...prev];
                      next[idx] = b;
                      return next.slice(0, 2);
                    }))
                    .catch(err => addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `拖拽失败: ${getErrorMessage(err)}` })));
              }}
            >
              <div className="flex items-center gap-1.5 text-gray-600 mb-1.5">
                <Camera size={11} />
                <span className="text-[10px] font-bold uppercase font-mono">首尾帧</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(['首帧', '尾帧'] as const).map((label, idx) => (
                  <label
                    key={label}
                    className="relative aspect-square rounded border border-dashed border-gray-700 bg-black/40 overflow-hidden cursor-pointer group/frame hover:border-indigo-500/70 transition-colors"
                  >
                    {refImages[idx] ? (
                      <>
                        <img src={refImages[idx]} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            setRefImages(prev => {
                              const next = [...prev];
                              next[idx] = '';
                              return next;
                            });
                          }}
                          className="absolute inset-0 bg-black/70 opacity-0 group-hover/frame:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <X size={12} className="text-white" />
                        </button>
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center gap-1 text-gray-600">
                        <Plus size={13} />
                        <span className="text-[10px] font-mono">{label}</span>
                      </div>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={e => {
                        handleFrameUpload(e.target.files, idx as 0 | 1);
                        e.target.value = '';
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : isImageToVideoMode ? (
            <div
              className="px-3 py-2 border-b border-gray-800/40"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = Array.from<File>(e.dataTransfer.files).find(f => f.type.startsWith('image/'));
                if (!file) return;
                fileToBase64(file)
                  .then(b => setRefImages([b]))
                  .catch(err => addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `拖拽失败: ${getErrorMessage(err)}` }));
              }}
            >
              <div className="flex items-center gap-1.5 text-gray-600 mb-1.5">
                <Camera size={11} />
                <span className="text-[10px] font-bold uppercase font-mono">图生视频</span>
              </div>
              <label className="relative block aspect-video rounded border border-dashed border-gray-700 bg-black/40 overflow-hidden cursor-pointer group/frame hover:border-indigo-500/70 transition-colors">
                {refImages[0] ? (
                  <>
                    <img src={refImages[0]} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault();
                        setRefImages([]);
                      }}
                      className="absolute inset-0 bg-black/70 opacity-0 group-hover/frame:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-1 text-gray-600">
                    <Plus size={13} />
                    <span className="text-[10px] font-mono">参考图 / 首帧</span>
                  </div>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={e => {
                    handleFrameUpload(e.target.files, 0);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          ) : (
            <div
              className="px-3 py-2 border-b border-gray-800/40"
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
              <div className="flex items-center gap-1.5 text-gray-600 mb-1.5">
                <Camera size={11} />
                <span className="text-[10px] font-bold uppercase font-mono">角色图</span>
                <label className="ml-auto p-0.5 text-gray-600 hover:text-indigo-400 cursor-pointer transition-colors">
                  <input type="file" className="hidden" accept="image/*" multiple onChange={handleUpload} />
                  <Plus size={12} />
                </label>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {refImages.map((src, idx) => (
                  <div key={idx} className="relative aspect-square rounded border border-gray-700 group/thumb overflow-hidden">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeRefImage(idx)}
                      className="absolute inset-0 bg-black/70 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isMotionControlModel && (
            <div
              className="px-3 py-2 border-b border-gray-800/40"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                handleMotionVideoUpload(e.dataTransfer.files);
              }}
            >
              <div className="flex items-center gap-1.5 text-gray-600 mb-1.5">
                <Film size={11} />
                <span className="text-[10px] font-bold uppercase font-mono">动作视频</span>
                {motionVideoFile && (
                  <button
                    onClick={clearMotionVideo}
                    className="ml-auto p-0.5 text-gray-600 hover:text-red-400 transition-colors"
                    title="移除动作视频"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {motionVideoFile ? (
                <div className="rounded border border-gray-700/80 bg-black/40 px-2 py-1.5">
                  <div className="text-[11px] text-gray-200 truncate">{motionVideoFile.name}</div>
                  <div className="text-[10px] text-gray-600 font-mono">
                    {(motionVideoFile.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
              ) : (
                <label className="block rounded border border-dashed border-gray-700 bg-black/40 px-2 py-2 text-[10px] text-gray-600 hover:border-indigo-500/70 hover:text-gray-300 cursor-pointer transition-colors">
                  点击或拖拽上传本地动作视频
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
              )}
            </div>
          )}

          <div className="px-3 py-2 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-gray-600">
                <AlignLeft size={11} />
                <span className="text-[10px] font-bold uppercase font-mono">提示词</span>
              </div>
              <button
                onClick={addPrompt}
                className="p-0.5 text-gray-600 hover:text-indigo-400 transition-colors"
                title="新增提示词段"
              >
                <Plus size={12} />
              </button>
            </div>
            {prompts.map((p, idx) => (
              <div key={idx} className="relative mb-1.5">
                <textarea
                  value={p}
                  onChange={e => updatePrompt(idx, e.target.value)}
                  onKeyDown={handleKeyDown(idx)}
                  placeholder={idx === 0
                    ? (isMotionControlModel ? '可选：描述动作迁移后的镜头、风格或质量要求...' : '描述你想生成的视频...')
                    : (isMotionControlModel ? '追加补充动作要求...' : '追加补充描述...')}
                  rows={3}
                  className="w-full bg-black/40 border border-gray-700/80 rounded px-2 py-1.5 text-[11px] text-gray-200 placeholder-gray-700 outline-none font-sans focus:border-indigo-500 transition-colors resize-none"
                />
                {idx > 0 && (
                  <button
                    onClick={() => removePrompt(idx)}
                    className="absolute top-1 right-1 p-0.5 text-gray-600 hover:text-red-400 transition-colors"
                    title="删除此段"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {isMotionControlModel && (
            <div className="px-3 py-2 border-t border-gray-800/40">
              <div className="flex items-center gap-1.5 text-gray-600 mb-1.5">
                <RefreshCw size={11} />
                <span className="text-[10px] font-bold uppercase font-mono">恢复任务</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={resumeTaskId}
                  onChange={e => setResumeTaskId(e.target.value)}
                  placeholder="task_id"
                  className="min-w-0 flex-1 bg-black/40 border border-gray-700/80 rounded px-2 py-1 text-[10px] text-gray-200 placeholder-gray-700 outline-none font-mono focus:border-indigo-500"
                />
                <button
                  onClick={handleRecoverTask}
                  disabled={isRecovering}
                  className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                    isRecovering
                      ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {isRecovering ? '查询中' : '恢复'}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 px-3 py-2 border-t border-gray-800/40">
            <select
              value={aspectRatio}
              onChange={e => setAspectRatio(e.target.value as AspectRatioType)}
              className="bg-black/40 border border-gray-700/80 rounded px-1.5 py-1 text-[10px] text-gray-400 outline-none cursor-pointer font-mono focus:border-indigo-500"
            >
              <option value="auto">比例: 自适应</option>
              <option value="1:1">1:1</option>
              <option value="3:4">3:4</option>
              <option value="4:3">4:3</option>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="21:9">21:9</option>
            </select>

            {isMotionControlModel ? (
              <select
                value={motionMode}
                onChange={e => setMotionMode(e.target.value)}
                className="bg-black/40 border border-gray-700/80 rounded px-1.5 py-1 text-[10px] text-gray-400 outline-none cursor-pointer font-mono focus:border-indigo-500"
              >
                <option value="std">模式: 标准</option>
                <option value="pro">模式: 专业</option>
              </select>
            ) : isFirstLastFrameMode && isVeoModel(videoApiConfig.modelName) ? (
              <div className="bg-black/40 border border-gray-800 rounded px-1.5 py-1 text-[10px] text-gray-600 font-mono">
                Veo 自动
              </div>
            ) : (
              <select
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="bg-black/40 border border-gray-700/80 rounded px-1.5 py-1 text-[10px] text-gray-400 outline-none cursor-pointer font-mono focus:border-indigo-500"
              >
                <option value="5">时长: 5s</option>
                <option value="10">时长: 10s</option>
              </select>
            )}

            {supportsVideoResolution && (
              <select
                value={effectiveVideoResolution}
                onChange={e => setVideoResolution(e.target.value as VideoResolutionType)}
                className="col-span-2 bg-black/40 border border-gray-700/80 rounded px-1.5 py-1 text-[10px] text-gray-400 outline-none cursor-pointer font-mono focus:border-indigo-500"
              >
                <option value="auto">分辨率: 默认</option>
                {videoResolutionOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}

            {isVeoGenerationMode && (
              <>
                <button
                  type="button"
                  onClick={() => setVeoEnhancePrompt(prev => !prev)}
                  className={`rounded border px-2 py-1 text-[10px] font-bold transition-colors ${
                    veoEnhancePrompt
                      ? 'border-indigo-500/30 bg-indigo-600/20 text-indigo-300'
                      : 'border-gray-800 bg-black/40 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  中文优化: {veoEnhancePrompt ? '开' : '关'}
                </button>
                <button
                  type="button"
                  onClick={() => setVeoUpsample(prev => !prev)}
                  className={`rounded border px-2 py-1 text-[10px] font-bold transition-colors ${
                    veoUpsample
                      ? 'border-indigo-500/30 bg-indigo-600/20 text-indigo-300'
                      : 'border-gray-800 bg-black/40 text-gray-500 hover:text-gray-300'
                  }`}
                >
                  1080p 提升: {veoUpsample ? '开' : '关'}
                </button>
              </>
            )}

            {isMotionControlModel && (
              <select
                value={characterOrientation}
                onChange={e => setCharacterOrientation(e.target.value as 'image' | 'video')}
                className="col-span-2 bg-black/40 border border-gray-700/80 rounded px-1.5 py-1 text-[10px] text-gray-400 outline-none cursor-pointer font-mono focus:border-indigo-500"
              >
                <option value="image">朝向: 跟随角色图</option>
                <option value="video">朝向: 跟随动作视频</option>
              </select>
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-800/40">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-bold text-sm transition-all ${
                isGenerating
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Zap size={14} fill="currentColor" />
                  生成视频
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="px-3 pb-2">
              <span className="text-[10px] text-red-400 font-mono">{error}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ════════════════════════════════════════
          中间主区域：预览
          ═══════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
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
            <div className="text-center select-none pointer-events-none">
              <Film size={52} className="mx-auto mb-3 text-gray-800" />
              <p className="text-[10px] text-gray-700 uppercase tracking-[0.3em] font-bold">Ready to Generate Video</p>
            </div>
          )}

          {isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-sm">
              <RefreshCw size={26} className="animate-spin text-indigo-400" />
              <span className="text-sm font-mono text-indigo-300 tracking-widest">GENERATING...</span>
            </div>
          )}
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
