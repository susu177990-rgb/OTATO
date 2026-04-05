import { AppSettings } from './types';

export const GRSAI_DEFAULT_ENDPOINT = 'https://grsai.dakka.com.cn/v1/draw/nano-banana';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  apiConfig: {
    endpointUrl: '',
    apiKey: '',
    modelName: 'gemini-3-pro-image-preview',
    apiProvider: 'laozhang'
  },
  videoApiConfig: {
    endpointUrl: 'https://api.gpt-best.com/v2/videos/generations',
    apiKey: '',
    modelName: 'luma-v1.6'
  },
  savedApiKeys: {},
  savedUrls: {}
};
