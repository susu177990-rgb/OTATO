import { AppSettings } from './types';

export const GRSAI_DEFAULT_ENDPOINT = 'https://grsai.dakka.com.cn/v1/draw/nano-banana';
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
    modelName: 'kling-video-motion-control'
  },
  savedApiKeys: {},
  savedUrls: {}
};
