import { generateImage } from './geminiService';
import { generateVideo } from './videoService';
import type {
  AppSettings,
  AspectRatioType,
  ConversationAttachmentEntry,
  GptImageQualityType,
  ImageSizeType,
  VideoGenerationConfig,
  VideoResolutionType,
} from '../types';
import {
  buildModelCatalog,
  catalogEntryForPreset,
  effectiveAgentImagePresetId,
  effectiveAgentVideoPresetId,
  resolveImagePresetToApiConfig,
  resolveVideoPresetToApiConfig,
} from './agentModelCatalog';
import { getErrorMessage } from '../utils/errorUtils';

export interface AgentToolContext {
  attachmentsById: Record<string, ConversationAttachmentEntry>;
}

function resolveRefUrls(
  urls: string[],
  attachmentsById: Record<string, ConversationAttachmentEntry>,
): string[] {
  return urls.map(u => {
    const t = u.trim();
    if (!t) return t;
    if (attachmentsById[t]?.dataUrl) return attachmentsById[t].dataUrl;
    const stripped = t.startsWith('convatt:') ? t.slice('convatt:'.length).trim() : t;
    if (attachmentsById[stripped]?.dataUrl) return attachmentsById[stripped].dataUrl;
    return t;
  });
}

function approxBytesFromDataUrl(dataUrl: string): number {
  const idx = dataUrl.indexOf(',');
  if (idx === -1) return dataUrl.length;
  const b64 = dataUrl.slice(idx + 1).replace(/\s/g, '');
  return Math.floor((b64.length * 3) / 4);
}

export async function executeAgentTool(
  toolName: string,
  argsJson: string,
  settings: AppSettings,
  ctx?: AgentToolContext,
): Promise<string> {
  const attachmentsById = ctx?.attachmentsById ?? {};
  try {
    switch (toolName) {
      case 'list_saved_models':
        return JSON.stringify({ success: true, models: buildModelCatalog(settings) }, null, 2);
      case 'list_conversation_attachments':
        return toolListConversationAttachments(attachmentsById);
      case 'get_attachment':
        return toolGetAttachment(argsJson, attachmentsById);
      case 'generate_image':
        return await toolGenerateImage(settings, argsJson, attachmentsById);
      case 'generate_video':
        return await toolGenerateVideo(settings, argsJson, attachmentsById);
      default:
        return JSON.stringify({ success: false, error: `未知工具: ${toolName}` });
    }
  } catch (e) {
    return JSON.stringify({ success: false, error: getErrorMessage(e) });
  }
}

function toolListConversationAttachments(
  attachmentsById: Record<string, ConversationAttachmentEntry>,
): string {
  const list = Object.values(attachmentsById).sort((a, b) => a.createdAt - b.createdAt);
  const slim = list.map(e => ({
    attachment_id: e.id,
    message_id: e.messageId,
    name: e.name,
    mime: e.mime,
    kind: e.kind,
    approx_bytes: approxBytesFromDataUrl(e.dataUrl),
  }));
  return JSON.stringify({ success: true, count: slim.length, attachments: slim }, null, 2);
}

function toolGetAttachment(
  argsJson: string,
  attachmentsById: Record<string, ConversationAttachmentEntry>,
): string {
  let attachment_id: string;
  try {
    attachment_id = JSON.parse(argsJson || '{}').attachment_id?.trim();
  } catch {
    return JSON.stringify({ success: false, error: 'get_attachment 需要合法 JSON' });
  }
  if (!attachment_id) {
    return JSON.stringify({ success: false, error: 'attachment_id 必填' });
  }
  const e = attachmentsById[attachment_id];
  if (!e) {
    return JSON.stringify({
      success: false,
      error: `未找到附件「${attachment_id}」，请先 list_conversation_attachments`,
    });
  }
  return JSON.stringify(
    {
      success: true,
      attachment_id: e.id,
      message_id: e.messageId,
      name: e.name,
      mime: e.mime,
      kind: e.kind,
      approx_bytes: approxBytesFromDataUrl(e.dataUrl),
      hint:
        '调用 generate_image / generate_video 时，在 ref_image_urls 数组中直接传入该 attachment_id 字符串即可，客户端会自动展开为 data URL；无需将 base64 写入工具参数。',
    },
    null,
    2,
  );
}

async function toolGenerateImage(
  settings: AppSettings,
  argsJson: string,
  attachmentsById: Record<string, ConversationAttachmentEntry>,
): Promise<string> {
  let args: {
    preset_id?: string;
    prompt?: string;
    aspect_ratio?: AspectRatioType;
    image_size?: ImageSizeType;
    image_quality?: GptImageQualityType;
    ref_image_urls?: string[];
  };
  try {
    args = JSON.parse(argsJson || '{}');
  } catch {
    return JSON.stringify({ success: false, error: 'generate_image 参数不是合法 JSON' });
  }

  const presetId = effectiveAgentImagePresetId(settings, args.preset_id);
  const prompt = args.prompt?.trim();
  if (!presetId) {
    return JSON.stringify({
      success: false,
      error:
        '未解析到生图 preset_id：请在对话页侧栏选择 Agent「生图路线」（已保存模型），或在参数中传入 list_saved_models 返回的生图 preset_id。',
    });
  }
  if (!prompt) {
    return JSON.stringify({ success: false, error: 'prompt 必填' });
  }

  const entry = catalogEntryForPreset(settings, presetId);
  if (!entry || entry.kind !== 'image') {
    return JSON.stringify({
      success: false,
      error: `preset_id 不是已保存的生图预设: ${presetId}。请先 list_saved_models。`,
    });
  }

  const apiConfig = resolveImagePresetToApiConfig(settings, presetId);
  const rawRefs = Array.isArray(args.ref_image_urls) ? args.ref_image_urls.filter(Boolean) : [];
  const refImages = resolveRefUrls(rawRefs, attachmentsById);

  const config = {
    aspectRatio: args.aspect_ratio || 'auto',
    imageSize: args.image_size || '1K',
    imageQuality: args.image_quality || 'auto',
    customPrompt: prompt,
  };

  const url = await generateImage(config, apiConfig, refImages);
  return JSON.stringify({
    success: true,
    media_url: url,
    kind: 'image',
    preset_id: presetId,
    model_name: entry.model_name,
  });
}

async function toolGenerateVideo(
  settings: AppSettings,
  argsJson: string,
  attachmentsById: Record<string, ConversationAttachmentEntry>,
): Promise<string> {
  let args: {
    preset_id?: string;
    prompt?: string;
    aspect_ratio?: AspectRatioType;
    duration?: number;
    video_resolution?: VideoResolutionType;
    video_mode?: VideoGenerationConfig['videoMode'];
    ref_image_urls?: string[];
  };
  try {
    args = JSON.parse(argsJson || '{}');
  } catch {
    return JSON.stringify({ success: false, error: 'generate_video 参数不是合法 JSON' });
  }

  const presetId = effectiveAgentVideoPresetId(settings, args.preset_id);
  const prompt = args.prompt?.trim();
  if (!presetId) {
    return JSON.stringify({
      success: false,
      error:
        '未解析到视频 preset_id：请在对话页侧栏选择 Agent「视频路线」（已保存模型），或在参数中传入 list_saved_models 返回的视频 preset_id。',
    });
  }
  if (!prompt) {
    return JSON.stringify({ success: false, error: 'prompt 必填' });
  }

  const entry = catalogEntryForPreset(settings, presetId);
  if (!entry || entry.kind !== 'video') {
    return JSON.stringify({
      success: false,
      error: `preset_id 不是已保存的视频预设: ${presetId}。请先 list_saved_models。`,
    });
  }

  const apiConfig = resolveVideoPresetToApiConfig(settings, presetId);
  const rawRefs = Array.isArray(args.ref_image_urls) ? args.ref_image_urls.filter(Boolean) : [];
  const refImages = resolveRefUrls(rawRefs, attachmentsById);

  const config: VideoGenerationConfig = {
    aspectRatio: args.aspect_ratio || 'auto',
    customPrompt: prompt,
    duration: args.duration,
    videoResolution: args.video_resolution || 'auto',
    videoMode: args.video_mode || apiConfig.videoMode,
  };

  const url = await generateVideo(config, apiConfig, refImages);
  return JSON.stringify({
    success: true,
    media_url: url,
    kind: 'video',
    preset_id: presetId,
    model_name: entry.model_name,
  });
}
