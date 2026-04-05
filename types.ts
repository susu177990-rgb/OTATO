export type AspectRatioType = 'auto' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageSizeType = '1K' | '2K' | '4K';

export interface ProtocolConfig {
  aspectRatio: AspectRatioType;
  imageSize: ImageSizeType;
  customPrompt?: string;
}

export type ApiProviderType = 'laozhang' | 'grsai';

export interface ApiConfig {
  /** 完整 API 请求地址，如 https://api.bltcy.ai/v1/chat/completions */
  endpointUrl: string;
  apiKey: string;
  modelName: string;
  presetId?: string;
  apiProvider?: ApiProviderType;
}

export interface AppSettings {
  apiConfig: ApiConfig;
  videoApiConfig?: ApiConfig;
  savedApiKeys?: Record<string, string>;
  savedUrls?: Record<string, string>;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'ERROR';
  message: string;
}

export type MediaType = 'image' | 'video';

export interface GeneratedImage { /* 现在我们泛用于媒体，改名比较麻烦，暂时在内部添加 type */
  id: string;
  url: string;
  type?: MediaType; // 标识是图片还是视频，默认为 image
  /** 1K 缩略图，画廊网格展示用；点击放大时用 url 原图 */
  thumbnailUrl?: string;
  prompt: string;
  timestamp: number;
  modelUsed: string;
  parameters: any;
}

