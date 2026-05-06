import type { ChatMessage } from '../types';

/**
 * 检测最近一条用户消息是否以 Slash 指令开头（如 /asset、/start）。
 * 用于压制模型重复打印菜单而不执行 Skill 步骤的行为。
 */
export function extractSlashCommandBoosterFromMessages(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;

    const textParts = m.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text');
    const headText = textParts.map(p => p.text).join('\n').trim();
    if (!headText) continue;

    const firstLine = headText.split('\n')[0]?.trim() ?? '';
    const firstToken = firstLine.split(/\s+/)[0] ?? '';
    if (!firstToken.startsWith('/')) continue;

    const cmd = firstToken.replace(/\/{2,}/g, '/');

    return (
      `用户本条消息以 Slash 指令 «${cmd}» 开头（正文可能还有后续行）。你必须立刻按照上文挂载的 Skill 文档里对该指令的约定输出「可直接复制使用的实质内容」` +
      `（例如 /asset 必须输出完整模板，而不是再列一遍命令表）。` +
      `严禁重复欢迎菜单、「请先发送 /start」等泛泛话术搪塞。` +
      `仅在 Skill 明确写明当前必须先完成其它步骤且当前指令无效时，才用两三句话说明原因并给出唯一清晰的下一步。`
    );
  }
  return null;
}

function cloneMessagesForEphemeralEdit(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(m => ({
    ...m,
    parts: m.parts.map(p =>
      p.type === 'text'
        ? { type: 'text', text: p.text }
        : p.type === 'attachment'
          ? { type: 'attachment', attachment: { ...p.attachment } }
          : p,
    ),
  }));
}

/**
 * 单次请求用：把 Slash 约束前缀写到「最近一条用户消息」的文本里（不写回持久化）。
 * 避免部分中转丢弃独立 system 消息后 upstream 侧 messages 为空，触发「messages is required」。
 */
export function applySlashBoosterToLastUser(messages: ChatMessage[], booster: string | null): ChatMessage[] {
  if (!booster?.trim()) return messages;

  const cloned = cloneMessagesForEphemeralEdit(messages);
  const prefix = `【Slash 指令约束】\n${booster}\n\n`;

  for (let i = cloned.length - 1; i >= 0; i--) {
    if (cloned[i].role !== 'user') continue;
    const m = cloned[i];
    const ti = m.parts.findIndex(p => p.type === 'text');
    if (ti >= 0) {
      const tp = m.parts[ti];
      if (tp.type === 'text') {
        m.parts[ti] = { type: 'text', text: prefix + tp.text };
      }
    } else {
      m.parts.unshift({ type: 'text', text: prefix.trimEnd() });
    }
    break;
  }
  return cloned;
}

/** 从当前消息列表提取 Slash 约束并合并到最后一条用户消息（仅用于发往 API 的副本）。 */
export function applySlashBoosterFromMessages(messages: ChatMessage[]): ChatMessage[] {
  return applySlashBoosterToLastUser(messages, extractSlashCommandBoosterFromMessages(messages));
}
