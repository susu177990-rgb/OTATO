import type { ApiConfig, AppSettings, VideoModeType } from '../types';

export const IMAGE_ACTIVE_PRESET_ID = '__image_active__';
export const VIDEO_ACTIVE_PRESET_ID = '__video_active__';

export interface ModelCatalogEntry {
  preset_id: string;
  display_name: string;
  kind: 'image' | 'video';
  model_name: string;
  endpoint_hint: string;
  api_provider?: string;
  video_mode?: VideoModeType;
}

function truncateHint(url: string, max = 48): string {
  const u = url.trim();
  if (u.length <= max) return u;
  return `${u.slice(0, max)}…`;
}

/**
 * 若用户在对话页侧栏为 Agent 指定了生图/视频路线且该预设仍存在，则强制使用该路线（忽略模型传入的 preset_id）。
 */
export function effectiveAgentImagePresetId(settings: AppSettings, requested?: string): string | undefined {
  const bound = settings.agentImagePresetId?.trim();
  if (bound && settings.customModels?.some(m => m.id === bound)) return bound;
  return requested?.trim() || undefined;
}

export function effectiveAgentVideoPresetId(settings: AppSettings, requested?: string): string | undefined {
  const bound = settings.agentVideoPresetId?.trim();
  if (bound && settings.videoCustomModels?.some(m => m.id === bound)) return bound;
  return requested?.trim() || undefined;
}

/** 供 Agent / list_saved_models 使用，不含 apiKey */
export function buildModelCatalog(settings: AppSettings): ModelCatalogEntry[] {
  const list: ModelCatalogEntry[] = [];

  const boundImg = settings.agentImagePresetId?.trim();
  const imgBound = !!(boundImg && settings.customModels?.some(m => m.id === boundImg));

  if (imgBound) {
    const m = settings.customModels!.find(x => x.id === boundImg)!;
    list.push({
      preset_id: m.id,
      display_name: `${m.name}（对话页 Agent 生图路线）`,
      kind: 'image',
      model_name: m.modelName,
      endpoint_hint: truncateHint(m.endpointUrl || ''),
      api_provider: m.apiProvider,
    });
  } else {
    list.push({
      preset_id: IMAGE_ACTIVE_PRESET_ID,
      display_name: '「生图」当前选中',
      kind: 'image',
      model_name: settings.apiConfig.modelName || '(未填)',
      endpoint_hint: truncateHint(settings.apiConfig.endpointUrl || ''),
      api_provider: settings.apiConfig.apiProvider,
    });

    for (const m of settings.customModels || []) {
      list.push({
        preset_id: m.id,
        display_name: m.name,
        kind: 'image',
        model_name: m.modelName,
        endpoint_hint: truncateHint(m.endpointUrl || ''),
        api_provider: m.apiProvider,
      });
    }
  }

  const vCfg = settings.videoApiConfig;
  const boundVid = settings.agentVideoPresetId?.trim();
  const vidBound = !!(boundVid && settings.videoCustomModels?.some(m => m.id === boundVid));

  if (vidBound) {
    const m = settings.videoCustomModels!.find(x => x.id === boundVid)!;
    list.push({
      preset_id: m.id,
      display_name: `${m.name}（对话页 Agent 视频路线）`,
      kind: 'video',
      model_name: m.modelName,
      endpoint_hint: truncateHint(m.endpointUrl || ''),
      api_provider: m.apiProvider,
      video_mode: m.videoMode || vCfg?.videoMode,
    });
  } else {
    if (vCfg) {
      list.push({
        preset_id: VIDEO_ACTIVE_PRESET_ID,
        display_name: '「视频」当前选中',
        kind: 'video',
        model_name: vCfg.modelName || '(未填)',
        endpoint_hint: truncateHint(vCfg.endpointUrl || ''),
        api_provider: vCfg.apiProvider,
        video_mode: vCfg.videoMode,
      });
    }

    for (const m of settings.videoCustomModels || []) {
      list.push({
        preset_id: m.id,
        display_name: m.name,
        kind: 'video',
        model_name: m.modelName,
        endpoint_hint: truncateHint(m.endpointUrl || ''),
        api_provider: m.apiProvider,
        video_mode: m.videoMode || vCfg?.videoMode,
      });
    }
  }

  return list;
}

export function catalogEntryForPreset(
  settings: AppSettings,
  presetId: string,
): ModelCatalogEntry | undefined {
  return buildModelCatalog(settings).find(e => e.preset_id === presetId);
}

function mergeImageApiConfig(base: ApiConfig, savedKeys?: Record<string, string>): ApiConfig {
  const key = base.presetId || base.modelName;
  const apiKey = base.apiKey || (key ? savedKeys?.[key] : undefined) || '';
  return { ...base, apiKey };
}

/** 将预设 id 解析为可调用 ApiConfig（含 savedApiKeys） */
export function resolveImagePresetToApiConfig(settings: AppSettings, presetId: string): ApiConfig {
  if (presetId === IMAGE_ACTIVE_PRESET_ID) {
    return mergeImageApiConfig(settings.apiConfig, settings.savedApiKeys);
  }
  const m = settings.customModels?.find(x => x.id === presetId);
  if (!m) {
    throw new Error(`未知生图预设「${presetId}」，请先调用 list_saved_models`);
  }
  const apiKey = m.apiKey || settings.savedApiKeys?.[m.id] || '';
  return {
    modelName: m.modelName,
    endpointUrl: m.endpointUrl,
    apiKey,
    presetId: m.id,
    apiProvider: m.apiProvider,
  };
}

export function resolveVideoPresetToApiConfig(settings: AppSettings, presetId: string): ApiConfig {
  const vCfg = settings.videoApiConfig;

  if (presetId === VIDEO_ACTIVE_PRESET_ID) {
    if (!vCfg) throw new Error('未配置视频 API（视频页当前选中不可用）');
    return {
      ...vCfg,
      apiKey: vCfg.apiKey || settings.savedApiKeys?.[vCfg.presetId || vCfg.modelName] || '',
    };
  }
  const m = settings.videoCustomModels?.find(x => x.id === presetId);
  if (!m) {
    throw new Error(`未知视频预设「${presetId}」，请先调用 list_saved_models`);
  }
  const apiKey = m.apiKey || settings.savedApiKeys?.[m.id] || '';
  return {
    modelName: m.modelName,
    endpointUrl: m.endpointUrl,
    apiKey,
    presetId: m.id,
    apiProvider: m.apiProvider,
    videoMode: m.videoMode ?? vCfg?.videoMode,
  };
}
