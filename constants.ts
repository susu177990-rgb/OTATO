import { AppSettings } from './types';

export const GRSAI_DEFAULT_BASE_URL = 'https://grsai.dakka.com.cn';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  apiConfig: {
    baseUrl: '',
    apiKey: '',
    modelName: 'gemini-3-pro-image-preview',
    apiProvider: 'laozhang'
  }
};
