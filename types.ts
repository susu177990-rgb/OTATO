export type AspectRatioType = 'auto' | '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '9:16' | '16:9' | '21:9';
export type ImageSizeType = '1K' | '2K' | '4K';
/** GPT Image / Grsai 等：与 OpenAI 文档一致，默认可用 auto 由模型决定 */
export type GptImageQualityType = 'auto' | 'low' | 'medium' | 'high';
export type VideoModeType = 'motion-transfer' | 'first-last-frame' | 'image-to-video';
export type VideoResolutionType = 'auto' | '480p' | '720p' | '780P' | '1080p' | '480P' | '720P' | '1080P';

export interface ProtocolConfig {
  aspectRatio: AspectRatioType;
  imageSize: ImageSizeType;
  /** 未传时由服务端按画质档位推断（兼容旧调用） */
  imageQuality?: GptImageQualityType;
  customPrompt?: string;
}

/** 视频生成参数（与 videoService.generateVideo 对齐） */
export type VideoGenerationConfig = Omit<ProtocolConfig, 'imageSize'> & {
  duration?: number;
  motionImageUrl?: string;
  motionVideoUrl?: string;
  motionVideoName?: string;
  motionMode?: string;
  characterOrientation?: 'image' | 'video';
  keepOriginalSound?: boolean;
  videoMode?: VideoModeType;
  videoResolution?: VideoResolutionType;
  enhancePrompt?: boolean;
  enableUpsample?: boolean;
};

/** 生图「接口格式」：OpenAI Images 下两套标准约定 + Grsai 异步 + 兼容 Chat 出图 + 自动识别 */
export type ApiProviderType =
  | 'laozhang'
  | 'grsai'
  | 'grsai-gpt-image'
  | 'grsai-nano-banana'
  | 'openai-image'
  /** `/v1/images/generations`：按 GPT Image（OpenAI）——仅 size(W×H)+gpt-image 时附带 quality 等，不传 image_size 档位 */
  | 'standard-openai-gpt-image'
  /** `/v1/images/generations`：按 Nano Banana 中转惯例——size(W×H) + 必选 body.image_size = 1K|2K|4K */
  | 'standard-openai-nano-banana';

export interface ApiConfig {
  /** 完整 API 请求地址，如 https://api.bltcy.ai/v1/chat/completions */
  endpointUrl: string;
  apiKey: string;
  modelName: string;
  presetId?: string;
  apiProvider?: ApiProviderType;
  videoMode?: VideoModeType;
}

export interface CustomModelConfig {
  id: string;
  name: string;
  modelName: string;
  endpointUrl: string;
  apiKey: string;
  apiProvider?: ApiProviderType;
  videoMode?: VideoModeType;
}

export interface AppSettings {
  apiConfig: ApiConfig;
  videoApiConfig?: ApiConfig;
  /** 对话页独立 endpoint / 模型 / Key（与生图互不覆盖） */
  chatApiConfig: ApiConfig;
  savedApiKeys?: Record<string, string>;
  savedUrls?: Record<string, string>;
  /** 对话自定义模型内存 Key（presetId → Key） */
  chatSavedApiKeys?: Record<string, string>;
  chatSavedUrls?: Record<string, string>;
  customModels?: CustomModelConfig[];
  videoCustomModels?: CustomModelConfig[];
  chatCustomModels?: CustomModelConfig[];
  /** 对话页 Agent「生图路线」所选已保存模型 id（存在时 generate_image 强制走该预设） */
  agentImagePresetId?: string;
  /** 对话页 Agent「视频路线」所选已保存模型 id（存在时 generate_video 强制走该预设） */
  agentVideoPresetId?: string;
}

/** 对话附件（IndexedDB 持久化，体积需注意） */
export type ChatAttachmentKind = 'image' | 'video' | 'file';

export interface ChatAttachment {
  kind: ChatAttachmentKind;
  mime: string;
  name: string;
  dataUrl: string;
  /** 会话级附件索引，用于 Agent 检索与 ref_image_urls 简写 */
  registryId?: string;
}

export type ChatMessagePart =
  | { type: 'text'; text: string }
  | { type: 'attachment'; attachment: ChatAttachment };

/** OpenAI tool_calls 条目（持久化于助手消息） */
export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  createdAt: number;
  parts: ChatMessagePart[];
  /** role === tool */
  toolCallId?: string;
  /** role === assistant，存在时表示模型发起了函数调用 */
  toolCalls?: ChatToolCall[];
}

export interface SkillDocument {
  name: string;
  markdown: string;
}

export interface SkillPackRecord {
  id: string;
  title: string;
  importedAt: number;
  skills: SkillDocument[];
}

export interface ConversationAttachmentEntry {
  id: string;
  messageId: string;
  name: string;
  mime: string;
  kind: ChatAttachmentKind;
  createdAt: number;
  dataUrl: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  /** 本会话启用的 Skill 包 id；未设置表示全部启用 */
  enabledSkillPackIds?: string[];
  /** 本会话用户上传附件索引（供 Agent 工具解析）；dataUrl 持久化在 IndexedDB */
  attachments?: ConversationAttachmentEntry[];
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
