import type { ChatMessage, ChatMessagePart, ConversationAttachmentEntry } from '../types';

export function buildAttachmentsById(
  entries: ConversationAttachmentEntry[] | undefined,
): Record<string, ConversationAttachmentEntry> {
  const m: Record<string, ConversationAttachmentEntry> = {};
  if (!entries?.length) return m;
  for (const e of entries) m[e.id] = e;
  return m;
}

/**
 * Agent 调用 API 专用：除「最后一条用户消息」外，将带 registryId 的附件替换为短文本占位，
 * 避免多轮重复传输巨型 base64；模型可通过工具 + ref_image_urls 填 attachment id。
 */
export function compactMessagesForAgentApi(messages: ChatMessage[]): ChatMessage[] {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  return messages.map((m, idx) => {
    if (m.role !== 'user' && m.role !== 'assistant') return m;
    if (idx === lastUserIdx) return m;

    const newParts: ChatMessagePart[] = [];
    for (const part of m.parts) {
      if (part.type === 'attachment' && part.attachment.registryId) {
        const a = part.attachment;
        const safeName = a.name.replace(/"/g, "'");
        newParts.push({
          type: 'text',
          text:
            `[会话附件 attachment_id="${a.registryId}" name="${safeName}" kind=${a.kind} mime=${a.mime}] ` +
            `二进制未重复附带。请 list_conversation_attachments 查看列表；get_attachment({"attachment_id":"${a.registryId}"}) 查看说明；` +
            `generate_image/generate_video 的 ref_image_urls 可直接传 "${a.registryId}"（无需粘贴 base64）。`,
        });
      } else {
        newParts.push(part);
      }
    }
    return { ...m, parts: newParts };
  });
}
