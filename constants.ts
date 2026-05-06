import type { AppSettings, CustomModelConfig } from './types';

/** Grsai 文档：海外节点 */
export const GRSAI_HOST_OVERSEAS = 'https://grsaiapi.com';
/** Grsai 文档：国内直连 */
export const GRSAI_HOST_DOMESTIC = 'https://grsai.dakka.com.cn';
export const GRSAI_DRAW_COMPLETIONS_PATH = '/v1/draw/completions';

/** 默认使用国内直连；亦可改用 GRSAI_ENDPOINT_OVERSEAS 或历史地址 https://api.grsai.com */
export const GRSAI_DEFAULT_ENDPOINT = `${GRSAI_HOST_DOMESTIC}${GRSAI_DRAW_COMPLETIONS_PATH}`;
export const GRSAI_ENDPOINT_OVERSEAS = `${GRSAI_HOST_OVERSEAS}${GRSAI_DRAW_COMPLETIONS_PATH}`;

/** Grsai 公告：￥0.045/张，支持 1K/2K/4K、质量 auto/low/medium/high、自定义像素见 OpenAI gpt-image-2 文档 */
export const GRSAI_GPT_IMAGE2_VIP_MODEL = 'gpt-image-2-vip';

/** BLTCY OpenAI Images：与生图页默认预设共用（可自行编辑保存模型覆盖） */
export const BLTCY_SHARED_IMAGE_ENDPOINT = 'https://api.bltcy.ai/v1/images/generations';
export const BLTCY_SHARED_IMAGE_API_KEY =
  'sk-jxPGXe4BdXYbsYbweWRUHTkNMiS6fm3OTTOgfssStrLKiN6S';

/** 默认内置可编辑生图模型（与生图页「保存模型」同源） */
export const DEFAULT_GPT_IMAGE2_PRESET_ID = 'bltcy-gpt-image-2';
export const DEFAULT_NANO_BANANA_2_PRESET_ID = 'bltcy-nano-banana-2';
export const DEFAULT_NANO_BANANA_PRO_PRESET_ID = 'bltcy-nano-banana-pro';

export const DEFAULT_GPT_IMAGE2_CUSTOM_MODEL: CustomModelConfig = {
  id: DEFAULT_GPT_IMAGE2_PRESET_ID,
  name: 'gpt-image-2',
  modelName: 'gpt-image-2',
  endpointUrl: BLTCY_SHARED_IMAGE_ENDPOINT,
  apiKey: BLTCY_SHARED_IMAGE_API_KEY,
  apiProvider: 'standard-openai-gpt-image',
};

export const DEFAULT_NANO_BANANA_2_CUSTOM_MODEL: CustomModelConfig = {
  id: DEFAULT_NANO_BANANA_2_PRESET_ID,
  name: 'nano-banana-2',
  modelName: 'gemini-3.1-flash-image-preview',
  endpointUrl: BLTCY_SHARED_IMAGE_ENDPOINT,
  apiKey: BLTCY_SHARED_IMAGE_API_KEY,
  apiProvider: 'standard-openai-nano-banana',
};

export const DEFAULT_NANO_BANANA_PRO_CUSTOM_MODEL: CustomModelConfig = {
  id: DEFAULT_NANO_BANANA_PRO_PRESET_ID,
  name: 'nano-banana-pro',
  modelName: 'nano-banana-pro',
  endpointUrl: BLTCY_SHARED_IMAGE_ENDPOINT,
  apiKey: BLTCY_SHARED_IMAGE_API_KEY,
  apiProvider: 'standard-openai-nano-banana',
};

/** 顺序：gpt-image-2 → nano-banana-2 → nano-banana-pro */
export const DEFAULT_FIXED_CUSTOM_MODELS: CustomModelConfig[] = [
  DEFAULT_GPT_IMAGE2_CUSTOM_MODEL,
  DEFAULT_NANO_BANANA_2_CUSTOM_MODEL,
  DEFAULT_NANO_BANANA_PRO_CUSTOM_MODEL,
];

/** 对话页默认：OpenAI 兼容 Chat Completions（可编辑，与生图 Key 同源常量） */
export const BLTCY_CHAT_COMPLETIONS_ENDPOINT = 'https://api.bltcy.ai/v1/chat/completions';
export const DEFAULT_CHAT_GPT55_PRESET_ID = 'bltcy-chat-gpt-55';

export const DEFAULT_CHAT_GPT55_CUSTOM_MODEL: CustomModelConfig = {
  id: DEFAULT_CHAT_GPT55_PRESET_ID,
  name: 'gpt-5.5',
  modelName: 'gpt-5.5',
  endpointUrl: BLTCY_CHAT_COMPLETIONS_ENDPOINT,
  apiKey: BLTCY_SHARED_IMAGE_API_KEY,
  apiProvider: 'laozhang',
};

export const DEFAULT_FIXED_CHAT_CUSTOM_MODELS: CustomModelConfig[] = [DEFAULT_CHAT_GPT55_CUSTOM_MODEL];

export function isDefaultFixedImagePreset(id: string): boolean {
  return DEFAULT_FIXED_CUSTOM_MODELS.some(m => m.id === id);
}

export function isDefaultFixedChatPreset(id: string): boolean {
  return DEFAULT_FIXED_CHAT_CUSTOM_MODELS.some(m => m.id === id);
}

export const KLING_MOTION_CONTROL_ENDPOINT = 'https://api.bltcy.ai/kling/v1/videos/motion-control';
export const WAN_ANIMATE_MOVE_ENDPOINT = 'https://api.bltcy.ai/qwen/api/v1/services/aigc/image2video/video-synthesis';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  apiConfig: {
    endpointUrl: DEFAULT_GPT_IMAGE2_CUSTOM_MODEL.endpointUrl,
    apiKey: DEFAULT_GPT_IMAGE2_CUSTOM_MODEL.apiKey,
    modelName: DEFAULT_GPT_IMAGE2_CUSTOM_MODEL.modelName,
    apiProvider: 'standard-openai-gpt-image',
    presetId: DEFAULT_GPT_IMAGE2_PRESET_ID,
  },
  chatApiConfig: {
    endpointUrl: DEFAULT_CHAT_GPT55_CUSTOM_MODEL.endpointUrl,
    apiKey: DEFAULT_CHAT_GPT55_CUSTOM_MODEL.apiKey,
    modelName: DEFAULT_CHAT_GPT55_CUSTOM_MODEL.modelName,
    apiProvider: 'laozhang',
    presetId: DEFAULT_CHAT_GPT55_PRESET_ID,
  },
  videoApiConfig: {
    endpointUrl: KLING_MOTION_CONTROL_ENDPOINT,
    apiKey: '',
    modelName: 'kling-video-motion-control',
    presetId: 'kling-video-motion-control',
    videoMode: 'motion-transfer',
  },
  savedUrls: Object.fromEntries(DEFAULT_FIXED_CUSTOM_MODELS.map(m => [m.id, m.endpointUrl])) as Record<
    string,
    string
  >,
  savedApiKeys: Object.fromEntries(DEFAULT_FIXED_CUSTOM_MODELS.map(m => [m.id, m.apiKey])) as Record<
    string,
    string
  >,
  chatSavedUrls: Object.fromEntries(DEFAULT_FIXED_CHAT_CUSTOM_MODELS.map(m => [m.id, m.endpointUrl])) as Record<
    string,
    string
  >,
  chatSavedApiKeys: Object.fromEntries(DEFAULT_FIXED_CHAT_CUSTOM_MODELS.map(m => [m.id, m.apiKey])) as Record<
    string,
    string
  >,
  customModels: [...DEFAULT_FIXED_CUSTOM_MODELS],
  chatCustomModels: [...DEFAULT_FIXED_CHAT_CUSTOM_MODELS],
};
