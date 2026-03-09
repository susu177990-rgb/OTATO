export type AspectRatioType = 'auto' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageSizeType = '1K' | '2K' | '4K';

export interface ProtocolConfig {
  aspectRatio: AspectRatioType;
  imageSize: ImageSizeType;
  customPrompt?: string;
}

export type ApiProviderType = 'laozhang' | 'grsai';

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  apiProvider?: ApiProviderType;
}

export interface AppSettings {
  apiConfig: ApiConfig;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'ERROR';
  message: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  /** 1K 缩略图，画廊网格展示用；点击放大时用 url 原图 */
  thumbnailUrl?: string;
  prompt: string;
  timestamp: number;
  modelUsed: string;
  parameters: any;
}
