export type AspectRatioType = 'auto' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageSizeType = '1K' | '2K' | '4K';

export interface ProtocolConfig {
  aspectRatio: AspectRatioType;
  imageSize: ImageSizeType;
  customPrompt?: string;
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
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
  prompt: string;
  timestamp: number;
  modelUsed: string;
  parameters: any;
}
