import { AppSettings } from './types';

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
export const KLING_MOTION_CONTROL_ENDPOINT = 'https://api.bltcy.ai/kling/v1/videos/motion-control';
export const WAN_ANIMATE_MOVE_ENDPOINT = 'https://api.bltcy.ai/qwen/api/v1/services/aigc/image2video/video-synthesis';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  apiConfig: {
    endpointUrl: '',
    apiKey: '',
    modelName: 'gemini-3-pro-image-preview',
    apiProvider: 'laozhang'
  },
  videoApiConfig: {
    endpointUrl: KLING_MOTION_CONTROL_ENDPOINT,
    apiKey: '',
    modelName: 'kling-video-motion-control',
    presetId: 'kling-video-motion-control',
    videoMode: 'motion-transfer'
  },
  savedApiKeys: {},
  savedUrls: {},
  customModels: []
};
