import type { ApiConfig, AppSettings, ChatMessage, ConversationAttachmentEntry } from '../types';
import {
  parseAssistantChoice,
  sendChatCompletionRaw,
  validateMessagesForSend,
} from './chatCompletion';
import { executeAgentTool, type AgentToolContext } from './agentToolExecutor';
import { IMAGE_ACTIVE_PRESET_ID, VIDEO_ACTIVE_PRESET_ID } from './agentModelCatalog';
import { buildAttachmentsById, compactMessagesForAgentApi } from './chatAttachmentRegistry';
import { applySlashBoosterToLastUser, extractSlashCommandBoosterFromMessages } from './slashCommandBooster';

export const AGENT_MAX_ITERATIONS = 10;

export const OPENAI_AGENT_TOOLS: unknown[] = [
  {
    type: 'function',
    function: {
      name: 'list_saved_models',
      description:
        '列出当前可用于对话 Agent 的生图 / 视频预设（不含密钥）。若在对话页侧栏为 Agent 选择了「生图路线 / 视频路线」中的已保存模型，对应类别通常只显示该项；否则列出「当前选中」及全部已保存自定义模型。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_conversation_attachments',
      description:
        '列出当前对话中用户曾上传的附件索引（无二进制）。需要引用较早轮次用户发来的文件、图片时应先调用。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attachment',
      description:
        '根据 attachment_id 查看附件元数据与用法说明；生成类工具可直接使用 attachment_id 作为参考图引用。',
      parameters: {
        type: 'object',
        properties: {
          attachment_id: {
            type: 'string',
            description: 'list_conversation_attachments 返回的 attachment_id',
          },
        },
        required: ['attachment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description:
        '调用生图 API。若在对话页侧栏为 Agent 选择了「生图路线」中的已保存模型，preset_id 可省略（客户端强制走该路线）；否则请先 list_saved_models 并传入对应的 preset_id。ref_image_urls 可为 http(s)、data URL，或本会话 attachment_id。',
      parameters: {
        type: 'object',
        properties: {
          preset_id: {
            type: 'string',
            description: `未在对话页指定 Agent 生图路线时必填；已指定时可省略。可选用「生图当前选中」占位 ${IMAGE_ACTIVE_PRESET_ID}`,
          },
          prompt: { type: 'string', description: '图像描述提示词' },
          aspect_ratio: {
            type: 'string',
            description: '如 auto, 1:1, 16:9 等',
          },
          image_size: { type: 'string', description: '1K | 2K | 4K' },
          image_quality: { type: 'string', description: 'auto | low | medium | high' },
          ref_image_urls: {
            type: 'array',
            items: { type: 'string' },
            description:
              '参考图：URL、data:image...、或 list_conversation_attachments 中的 attachment_id',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_video',
      description:
        '调用视频生成 API。若在对话页侧栏为 Agent 选择了「视频路线」中的已保存模型，preset_id 可省略（客户端强制走该路线）；否则请先 list_saved_models。motion-control 等需在 ref_image_urls 中提供参考图；可使用 attachment_id。',
      parameters: {
        type: 'object',
        properties: {
          preset_id: {
            type: 'string',
            description: `未在对话页指定 Agent 视频路线时必填；已指定时可省略。可选用「视频当前选中」占位 ${VIDEO_ACTIVE_PRESET_ID}`,
          },
          prompt: { type: 'string', description: '视频描述' },
          aspect_ratio: { type: 'string' },
          duration: { type: 'number', description: '时长（秒），视模型支持而定' },
          video_resolution: { type: 'string', description: '如 auto, 720p, 1080p' },
          video_mode: {
            type: 'string',
            description: 'motion-transfer | first-last-frame | image-to-video',
          },
          ref_image_urls: {
            type: 'array',
            items: { type: 'string' },
            description: '首帧/参考图：URL、data URL、或 attachment_id',
          },
        },
        required: ['prompt'],
      },
    },
  },
];

function buildAgentSystemText(skillBlocks: string[], settings: AppSettings): string {
  const skillsSection =
    skillBlocks.length === 0 ? '（当前未挂载 Skill 文档）' : skillBlocks.join('\n\n---\n\n');

  const imgBind =
    settings.agentImagePresetId?.trim() &&
    settings.customModels?.some(m => m.id === settings.agentImagePresetId)
      ? settings.customModels!.find(m => m.id === settings.agentImagePresetId)!
      : null;
  const vidBind =
    settings.agentVideoPresetId?.trim() &&
    settings.videoCustomModels?.some(m => m.id === settings.agentVideoPresetId)
      ? settings.videoCustomModels!.find(m => m.id === settings.agentVideoPresetId)!
      : null;

  const bindLines: string[] = [];
  if (imgBind) {
    bindLines.push(
      `- **生图**已在对话页指定路线「${imgBind.name}」：generate_image 固定使用该「已保存模型」的 Endpoint 与 Key（preset_id 可省略）。`,
    );
  }
  if (vidBind) {
    bindLines.push(
      `- **视频**已在对话页指定路线「${vidBind.name}」：generate_video 固定使用该「已保存模型」的 Endpoint 与 Key（preset_id 可省略）。`,
    );
  }
  const bindNote =
    bindLines.length > 0 ? `\n## 对话页指定的 Agent 生图 / 视频路线\n${bindLines.join('\n')}\n` : '';

  return `你是 OTATO 应用内的对话 Agent。用户可能在 Skill 文档中定义了工作方式，请优先遵循 Skill 中的流程与约束。
${bindNote}
## 工具使用约定
- 调用 generate_image / generate_video 前请先 **list_saved_models**（确认列表中的 preset_id；若在对话页侧栏为 Agent 指定了生图 / 视频路线，通常只会看到对应已保存模型）。
- 未在对话页指定 Agent 路线时：生图可用「${IMAGE_ACTIVE_PRESET_ID}」表示生图页当前选中；视频可用「${VIDEO_ACTIVE_PRESET_ID}」表示视频页当前选中（需在列表中存在）。
- **用户历史上传的附件**：较早轮次的图片/文件在模型上下文里可能已被压缩为占位说明。需要引用它们时，请先 **list_conversation_attachments**，再在 **generate_image / generate_video** 的 **ref_image_urls** 中填入对应的 **attachment_id**（无需 base64）；如需确认类型可用 **get_attachment**。
- generate_image / generate_video 的 API Key 来自用户在生图 / 视频页为各预设保存的配置。
- motion-transfer、参考图类视频接口通常需要在 ref_image_urls 中提供至少一张图（可为 http(s)、data:image...、或 attachment_id）。
- 工具返回 JSON：success 为 false 时向用户说明原因；success 且含 media_url 时汇总结果（不要编造 URL）。

## Skill 文档
${skillsSection}`;
}

export async function runAgentChatTurn(params: {
  chatApiConfig: ApiConfig;
  settings: AppSettings;
  conversationMessages: ChatMessage[];
  skillMarkdownBlocks: string[];
  conversationAttachments?: ConversationAttachmentEntry[];
  maxIterations?: number;
}): Promise<ChatMessage[]> {
  const {
    chatApiConfig,
    settings,
    conversationMessages,
    skillMarkdownBlocks,
    conversationAttachments,
    maxIterations = AGENT_MAX_ITERATIONS,
  } = params;

  const attachmentCtx: AgentToolContext = {
    attachmentsById: buildAttachmentsById(conversationAttachments),
  };

  const slashBooster = extractSlashCommandBoosterFromMessages(conversationMessages);

  const systemMsg: ChatMessage = {
    id: `sys-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'system',
    createdAt: Date.now(),
    parts: [{ type: 'text', text: buildAgentSystemText(skillMarkdownBlocks, settings) }],
  };

  const history = applySlashBoosterToLastUser(
    compactMessagesForAgentApi(conversationMessages.filter(m => m.role !== 'system')),
    slashBooster,
  );

  let apiMessages: ChatMessage[] = [systemMsg, ...history];

  validateMessagesForSend(apiMessages);

  const appended: ChatMessage[] = [];

  for (let round = 0; round < maxIterations; round++) {
    const raw = await sendChatCompletionRaw(chatApiConfig, apiMessages, {
      tools: OPENAI_AGENT_TOOLS,
      tool_choice: 'auto',
    });

    const { contentText, toolCalls } = parseAssistantChoice(raw);

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}-ar-${round}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'assistant',
      createdAt: Date.now(),
      parts: contentText ? [{ type: 'text', text: contentText }] : [],
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };

    appended.push(assistantMsg);
    apiMessages = [...apiMessages, assistantMsg];

    if (toolCalls.length === 0) {
      break;
    }

    for (const tc of toolCalls) {
      const resultStr = await executeAgentTool(tc.name, tc.arguments, settings, attachmentCtx);
      const toolMsg: ChatMessage = {
        id: `msg-${Date.now()}-tool-${tc.id}`,
        role: 'tool',
        createdAt: Date.now(),
        parts: [{ type: 'text', text: resultStr }],
        toolCallId: tc.id,
      };
      appended.push(toolMsg);
      apiMessages = [...apiMessages, toolMsg];
    }
  }

  return appended;
}
