import React, { useEffect, useRef, useState } from 'react';
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
 Save,
 Trash2,
 Key,
 Pencil
} from 'lucide-react';
import { AppSettings, GeneratedImage, LogEntry, AspectRatioType, ImageSizeType, GptImageQualityType, ProtocolConfig, CustomModelConfig, ApiProviderType } from '../types';
import { generateImage, downloadImage, isImageResult, fileToBase64 } from '../services/geminiService';
import { getErrorMessage } from '../utils/errorUtils';
import { GRSAI_DEFAULT_ENDPOINT, GRSAI_GPT_IMAGE2_VIP_MODEL } from '../constants';

// ── 模型预设（侧边栏快速切换用） ──────────────────────────────────
// 已移除内置预设，全部由用户自定义添加

interface GeneratorProps {
  isActive: boolean;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  addLog: (entry: LogEntry) => void;
  logs: LogEntry[];
  addGeneratedImage: (img: GeneratedImage) => Promise<void>;
  showLogs: boolean;
}

const Generator: React.FC<GeneratorProps> = ({
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
  const [aspectRatio, setAspectRatio] = React.useState<AspectRatioType>('auto');
  const [imageSize, setImageSize] = React.useState<ImageSizeType>('1K');
  const [imageQuality, setImageQuality] = React.useState<GptImageQualityType>('auto');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showAddModel, setShowAddModel] = React.useState(false);
  const [editingModelId, setEditingModelId] = React.useState<string | null>(null);
  const [newModel, setNewModel] = React.useState<{ name: string; modelName: string; endpointUrl: string; apiKey: string; apiProvider: ApiProviderType }>({
    name: '',
    modelName: '',
    endpointUrl: '',
    apiKey: '',
    apiProvider: 'laozhang'
  });
  const logEndRef = useRef<HTMLDivElement>(null);

  // 虽然不暴露 provider 切换开关，但直接把这两组模型做合并全量展示
  // 已移除内置预设，由用户自定义模型
  const modelPresets: any[] = [];

  // 当前模型是否不在预设列表里
  const currentModelInPresets = modelPresets.some(m => m.id === settings.apiConfig.modelName);

  const readImageDimensions = (src: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('读取图片尺寸失败'));
      img.src = src;
    });
  };

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

  const setModel = (modelId: string) => {
    const preset = modelPresets.find(m => m.id === modelId);
    setSettings(prev => {
      let newEndpointUrl = prev.savedUrls?.[modelId] ?? (preset?.url ?? prev.apiConfig.endpointUrl);
      const newApiKey = prev.savedApiKeys?.[modelId] ?? '';

      return {
        ...prev,
        apiConfig: {
          ...prev.apiConfig,
          modelName: preset ? preset.modelName : modelId,
          presetId: modelId,
          endpointUrl: newEndpointUrl,
          apiKey: newApiKey
        }
      };
    });
  };

const setApiConfig = (key: keyof AppSettings['apiConfig'], val: string) => {
    setSettings(prev => {
      const nextApiConfig = { ...prev.apiConfig, [key]: val };
      let nextSavedApiKeys = prev.savedApiKeys || {};
      let nextSavedUrls = prev.savedUrls || {};

      const memoryKey = prev.apiConfig.presetId || prev.apiConfig.modelName;

      if (key === 'apiKey') {
        nextSavedApiKeys = { ...nextSavedApiKeys, [memoryKey]: val };
      } else if (key === 'endpointUrl') {
        nextSavedUrls = { ...nextSavedUrls, [memoryKey]: val };
      }

      return {
        ...prev,
        apiConfig: nextApiConfig,
        savedApiKeys: nextSavedApiKeys,
        savedUrls: nextSavedUrls
      };
    });
  };

  // 保存自定义模型
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
      apiProvider: newModel.apiProvider
    };
    setSettings(prev => {
      const customModels = editingModelId
        ? (prev.customModels || []).map(m => m.id === editingModelId ? customModel : m)
        : [...(prev.customModels || []), customModel];
      const isSelected = prev.apiConfig.presetId === modelId;

      return {
        ...prev,
        customModels,
        apiConfig: isSelected
          ? {
              ...prev.apiConfig,
              modelName: customModel.modelName,
              endpointUrl: customModel.endpointUrl,
              apiKey: customModel.apiKey,
              apiProvider: customModel.apiProvider,
            }
          : prev.apiConfig,
        savedUrls: { ...prev.savedUrls, [modelId]: newModel.endpointUrl },
        savedApiKeys: { ...prev.savedApiKeys, [modelId]: newModel.apiKey }
      };
    });
    addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'SUCCESS', message: editingModelId ? `自定义模型「${newModel.name}」已更新` : `自定义模型「${newModel.name}」已保存` });
    setNewModel({ name: '', modelName: '', endpointUrl: '', apiKey: '', apiProvider: 'laozhang' });
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
      apiProvider: model.apiProvider || 'laozhang',
    });
    setShowAddModel(true);
  };

  const handleCancelEditCustomModel = () => {
    setEditingModelId(null);
    setNewModel({ name: '', modelName: '', endpointUrl: '', apiKey: '', apiProvider: 'laozhang' });
    setShowAddModel(false);
  };

  const fillGrsaiGptImageModel = () => {
    setNewModel(prev => ({
      ...prev,
      name: prev.name || 'GrsAi GPT Image 1.5',
      modelName: 'gpt-image-1.5',
      endpointUrl: GRSAI_DEFAULT_ENDPOINT,
      apiProvider: 'grsai-gpt-image'
    }));
  };

  const fillGrsaiGptImage2VipModel = () => {
    setNewModel(prev => ({
      ...prev,
      name: prev.name || 'GrsAi GPT Image 2 VIP (￥0.045/张)',
      modelName: GRSAI_GPT_IMAGE2_VIP_MODEL,
      endpointUrl: GRSAI_DEFAULT_ENDPOINT,
      apiProvider: 'grsai-gpt-image'
    }));
  };

  // 删除自定义模型
  const handleDeleteCustomModel = (modelId: string) => {
    setSettings(prev => ({
      ...prev,
      customModels: (prev.customModels || []).filter(m => m.id !== modelId)
    }));
    addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: `自定义模型已删除` });
  };

  // 选中自定义模型
  const setCustomModel = (model: CustomModelConfig) => {
    setSettings(prev => ({
      ...prev,
      apiConfig: {
        ...prev.apiConfig,
        modelName: model.modelName,
        presetId: model.id,
        endpointUrl: model.endpointUrl,
        apiKey: model.apiKey || prev.savedApiKeys?.[model.id] || '',
        apiProvider: model.apiProvider || prev.apiConfig.apiProvider
      }
    }));
  };

  const handleGenerate= async () => {
    const combinedPrompt = prompts.map(p => p.trim()).filter(Boolean).join(' ');
    if (!combinedPrompt) { setError('请输入提示词'); return; }
    setIsGenerating(true);
    setError(null);
    const config: ProtocolConfig = { aspectRatio, imageSize, imageQuality, customPrompt: combinedPrompt };
    const startTime = Date.now();
    addLog({ id: `start-${Date.now()}`, timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: `开始生图 [${settings.apiConfig.modelName || '默认模型'}]，比例 ${aspectRatio}，分辨率 ${imageSize}，质量 ${imageQuality}...` });

    try {
      const resultUrl = await generateImage(config, settings.apiConfig, refImages);
      setLastResult(resultUrl);
      if (resultUrl && isImageResult(resultUrl)) {
        let persistUrl = resultUrl;
        if (resultUrl.startsWith('http')) {
          try {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: '正在转换网络图片为本地图像...' });
            const resp = await fetch(resultUrl);
            const blob = await resp.blob();
            persistUrl = await new Promise<string>((res, rej) => {
              const r = new FileReader();
              r.onloadend = () => res(r.result as string);
              r.onerror = rej;
              r.readAsDataURL(blob);
            });
          } catch (cvtErr) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `URL转base64失败: ${getErrorMessage(cvtErr)}` });
          }
        }
        try {
          const dimensions = await readImageDimensions(persistUrl);
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: `原图尺寸: ${dimensions.width}x${dimensions.height}` });
        } catch (dimErr) {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `读取原图尺寸失败: ${getErrorMessage(dimErr)}` });
        }
        await addGeneratedImage({ id: Date.now().toString(), url: persistUrl, prompt: combinedPrompt, timestamp: Date.now(), modelUsed: settings.apiConfig.modelName, parameters: config });
      }
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'SUCCESS', message: `生成成功，耗时 ${duration}s` });
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `生图失败 (耗时 ${duration}s): ${msg}` });
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
  左侧边栏：设置 + 模型 + 操作
  ═══════════════════════════════════════ */}
  <aside className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col overflow-hidden">

  {/* 模型区 */}
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

  {/* 添加 / 编辑自定义模型表单 */}
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
        placeholder="模型名 (如 gpt-image-1)"
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
      <select
        value={newModel.apiProvider}
        onChange={e => setNewModel(prev => ({ ...prev, apiProvider: e.target.value as ApiProviderType }))}
        className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-gray-300 outline-none font-mono focus:border-indigo-500"
      >
        <option value="laozhang">接口格式: OpenAI 兼容 Chat</option>
        <option value="grsai-gpt-image">接口格式: GrsAi GPT Image</option>
        <option value="grsai-nano-banana">接口格式: GrsAi Nano Banana</option>
        <option value="openai-image">接口格式: OpenAI Images</option>
      </select>
      <div className="flex flex-col gap-1">
        <button
          onClick={fillGrsaiGptImageModel}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded text-[10px] font-bold transition-colors"
        >
          <Zap size={10} /> 填入 GrsAi GPT Image
        </button>
        <button
          onClick={fillGrsaiGptImage2VipModel}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-amber-600/15 hover:bg-amber-600/25 text-amber-400 rounded text-[10px] font-bold transition-colors"
          title="公告模型 gpt-image-2-vip，￥0.045/张，1K/2K/4K + 质量 auto/low/medium/high"
        >
          <Zap size={10} /> 填入 GPT Image 2 VIP
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

  {/* 模型列表 */}
  <div className="flex-1 overflow-y-auto custom-scrollbar py-1.5 px-2 space-y-1">

    {/* 自定义模型列表 */}
    {settings.customModels && settings.customModels.length > 0 && (
      <div className="space-y-0.5">
        {settings.customModels.map(m => {
          const isSelected = settings.apiConfig.presetId === m.id;
          return (
            <div key={m.id} className="group flex items-center">
              <button
                onClick={() => setCustomModel(m)}
                title={`${m.name}\n${m.endpointUrl}\n${m.apiProvider || 'auto'}`}
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
  </div>

{/* 操作控制区 */}
  <div className="flex-shrink-0 border-t border-gray-800/60 bg-gray-950/50 flex flex-col">

    {/* 参考图（上方，4xn 网格向下延伸） */}
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
        <span className="text-[10px] font-bold uppercase font-mono">参考图</span>
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

    {/* 提示词（更高） */}
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
            placeholder={idx === 0 ? "描述你想生成的图像..." : "追加描述..."}
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

    {/* 比例 + 画质 */}
    <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-800/40">
      <select
        value={aspectRatio}
        onChange={e => setAspectRatio(e.target.value as AspectRatioType)}
        className="flex-1 bg-black/40 border border-gray-700/80 rounded px-1.5 py-1 text-[10px] text-gray-400 outline-none cursor-pointer font-mono focus:border-indigo-500"
      >
<option value="auto">比例: 自适应</option>
<option value="1:1">1:1</option>
<option value="2:3">2:3</option>
<option value="3:2">3:2</option>
<option value="3:4">3:4</option>
<option value="4:3">4:3</option>
<option value="9:16">9:16</option>
<option value="16:9">16:9</option>
<option value="21:9">21:9</option>
      </select>

      <select
        value={imageSize}
        onChange={e => setImageSize(e.target.value as ImageSizeType)}
        className="flex-1 bg-black/40 border border-gray-700/80 rounded px-1.5 py-1 text-[10px] text-gray-400 outline-none cursor-pointer font-mono focus:border-indigo-500"
      >
        <option value="1K">1K</option>
        <option value="2K">2K</option>
        <option value="4K">4K</option>
      </select>
    </div>

    <div className="px-3 pb-2 border-t border-gray-800/30">
      <select
        value={imageQuality}
        onChange={e => setImageQuality(e.target.value as GptImageQualityType)}
        className="w-full bg-black/40 border border-gray-700/80 rounded px-1.5 py-1 text-[10px] text-gray-400 outline-none cursor-pointer font-mono focus:border-indigo-500"
        title="GPT Image / Grsai：对应 low / medium / high / auto（默认 auto）"
      >
        <option value="auto">质量: auto（默认）</option>
        <option value="low">low</option>
        <option value="medium">medium</option>
        <option value="high">high</option>
      </select>
    </div>

    {/* 生成按钮（最下方单独一行） */}
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
            生成图片
          </>
        )}
      </button>
    </div>

{/* 错误提示 */}
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

  {/* 预览区 */}
  <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0 bg-black">
    {lastResult ? (
      (lastResult.startsWith('data:image') || lastResult.startsWith('http')) ? (
        <div className="relative group w-full h-full flex items-center justify-center p-6">
          <img
            src={lastResult}
            alt="Generated"
            className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.9)]"
          />
          {/* hover 操作 */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0">
            <button
              onClick={() => downloadImage(lastResult, `otato-${Date.now()}.png`)}
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
        <div className="w-full max-w-2xl p-8 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 mb-4 text-purple-400">
            <Terminal size={14} />
            <span className="text-xs font-bold tracking-wider">LLM RESPONSE</span>
          </div>
          <div className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm font-mono">{lastResult}</div>
        </div>
      )
    ) : (
      <div className="text-center select-none pointer-events-none">
        <ImageIcon size={52} className="mx-auto mb-3 text-gray-800" />
        <p className="text-[10px] text-gray-700 uppercase tracking-[0.3em] font-bold">Ready to Generate</p>
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

export default Generator;
