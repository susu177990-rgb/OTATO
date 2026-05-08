import React, { useEffect, useRef, useState } from 'react';
import {
  Cpu,
  Plus,
  X,
  Save,
  Trash2,
  Pencil,
  Send,
  Paperclip,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import {
  AppSettings,
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  ChatMessagePart,
  ConversationAttachmentEntry,
  CustomModelConfig,
  ApiProviderType,
  SkillPackRecord,
} from '../types';
import { fileToBase64 } from '../services/geminiService';
import { CHAT_MAX_ATTACHMENT_BYTES } from '../services/chatCompletion';
import { loadChatState, schedulePersistChatState } from '../services/chatStorage';
import { parseSkillZipFile, MAX_SKILL_ZIP_BYTES } from '../services/skillPack';
import { loadSkillPacks, saveSkillPacks } from '../services/skillPackStorage';
import { runAgentChatTurn } from '../services/chatAgent';
import { getErrorMessage } from '../utils/errorUtils';
import { DEFAULT_FIXED_CHAT_CUSTOM_MODELS, isDefaultFixedChatPreset } from '../constants';
import { GitHubMarkdown } from './GitHubMarkdown';
import { ChatSkillPackPanel } from './ChatSkillPackPanel';

interface ChatViewProps {
  isActive: boolean;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  showSidebar: boolean;
}

function newConversation(): ChatConversation {
  const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    title: '新对话',
    updatedAt: Date.now(),
    messages: [],
  };
}

function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return '新对话';
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

function attachmentKindFromFile(file: File): ChatAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

function getSkillMarkdownBlocks(conv: ChatConversation | null, packs: SkillPackRecord[]): string[] {
  if (packs.length === 0) return [];
  const enabled = conv?.enabledSkillPackIds;
  const activePacks =
    enabled === undefined || conv === null ? packs : packs.filter(p => enabled.includes(p.id));
  const blocks: string[] = [];
  for (const pack of activePacks) {
    for (const s of pack.skills) {
      blocks.push(`### Skill「${s.name}」（包: ${pack.title}）\n\n${s.markdown}`);
    }
  }
  return blocks;
}

function ToolResultBody({ text }: { text: string }) {
  try {
    const j = JSON.parse(text) as {
      success?: boolean;
      media_url?: string;
      kind?: string;
      error?: string;
    };
    if (j.success && j.media_url && typeof j.media_url === 'string') {
      const u = j.media_url;
      const isVid =
        j.kind === 'video' ||
        /\.(mp4|webm|mov|m4v)(\?|$)/i.test(u) ||
        u.startsWith('data:video');
      return (
        <div className="space-y-2">
          <pre className="text-[10px] text-gray-500 whitespace-pre-wrap break-all max-h-24 overflow-y-auto custom-scrollbar">
            {text.length > 1200 ? `${text.slice(0, 1200)}…` : text}
          </pre>
          {isVid ? (
            <video src={u} controls className="max-w-full max-h-48 rounded-lg border border-gray-700/60" />
          ) : (
            <img src={u} alt="" className="max-w-full max-h-48 rounded-lg border border-gray-700/60 object-contain" />
          )}
        </div>
      );
    }
  } catch {
    /* not JSON */
  }
  return (
    <pre className="text-[10px] whitespace-pre-wrap break-words font-mono text-gray-400">{text}</pre>
  );
}

const ChatView: React.FC<ChatViewProps> = ({ isActive, settings, setSettings, showSidebar }) => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [inputText, setInputText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [showAddModel, setShowAddModel] = useState(false);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [newModel, setNewModel] = useState<{
    name: string;
    modelName: string;
    endpointUrl: string;
    apiKey: string;
    apiProvider: ApiProviderType;
  }>({
    name: '',
    modelName: '',
    endpointUrl: '',
    apiKey: '',
    apiProvider: 'laozhang',
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const [skillPacks, setSkillPacks] = useState<SkillPackRecord[]>([]);

  const scrollEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const chatCfg = settings.chatApiConfig;

  const chatModelMap = new Map((settings.chatCustomModels || []).map(m => [m.id, m]));
  const defaultChatModelRows = DEFAULT_FIXED_CHAT_CUSTOM_MODELS.map(d => chatModelMap.get(d.id)).filter(
    (m): m is CustomModelConfig => m != null,
  );
  const otherChatModels = (settings.chatCustomModels || []).filter(m => !isDefaultFixedChatPreset(m.id));

  useEffect(() => {
    let cancelled = false;
    loadChatState().then(s => {
      if (cancelled) return;
      setConversations(s.conversations.length ? s.conversations : []);
      setActiveConversationId(s.activeConversationId);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSkillPacks().then(p => {
      if (!cancelled) setSkillPacks(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    schedulePersistChatState({ conversations, activeConversationId });
  }, [hydrated, conversations, activeConversationId]);

  useEffect(() => {
    if (!isActive || !showSidebar) return;
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConversationId, isActive, showSidebar]);

  const activeConversation =
    conversations.find(c => c.id === activeConversationId) ?? null;

  const handleSaveCustomModel = () => {
    if (!newModel.name || !newModel.modelName || !newModel.endpointUrl) {
      setComposerError('请填写模型显示名称、模型名与 API 地址');
      return;
    }
    const modelId = editingModelId || `chat-custom-${Date.now()}`;
    const customModel: CustomModelConfig = {
      id: modelId,
      name: newModel.name,
      modelName: newModel.modelName,
      endpointUrl: newModel.endpointUrl,
      apiKey: newModel.apiKey,
      apiProvider: 'laozhang',
    };
    setSettings(prev => {
      const chatCustomModels = editingModelId
        ? (prev.chatCustomModels || []).map(m => (m.id === editingModelId ? customModel : m))
        : [...(prev.chatCustomModels || []), customModel];
      const isSelected = prev.chatApiConfig.presetId === modelId;
      return {
        ...prev,
        chatCustomModels,
        chatApiConfig: isSelected
          ? {
              ...prev.chatApiConfig,
              modelName: customModel.modelName,
              endpointUrl: customModel.endpointUrl,
              apiKey: customModel.apiKey || prev.chatSavedApiKeys?.[modelId] || '',
              apiProvider: 'laozhang',
              presetId: modelId,
            }
          : prev.chatApiConfig,
        chatSavedUrls: { ...prev.chatSavedUrls, [modelId]: newModel.endpointUrl },
        chatSavedApiKeys: { ...prev.chatSavedApiKeys, [modelId]: newModel.apiKey },
      };
    });
    setNewModel({ name: '', modelName: '', endpointUrl: '', apiKey: '', apiProvider: 'laozhang' });
    setEditingModelId(null);
    setShowAddModel(false);
    setComposerError(null);
  };

  const handleEditCustomModel = (model: CustomModelConfig) => {
    setEditingModelId(model.id);
    setNewModel({
      name: model.name,
      modelName: model.modelName,
      endpointUrl: model.endpointUrl,
      apiKey: model.apiKey || settings.chatSavedApiKeys?.[model.id] || '',
      apiProvider: 'laozhang',
    });
    setShowAddModel(true);
  };

  const handleCancelEditCustomModel = () => {
    setEditingModelId(null);
    setNewModel({ name: '', modelName: '', endpointUrl: '', apiKey: '', apiProvider: 'laozhang' });
    setShowAddModel(false);
  };

  const handleDeleteCustomModel = (modelId: string) => {
    setSettings(prev => ({
      ...prev,
      chatCustomModels: (prev.chatCustomModels || []).filter(m => m.id !== modelId),
    }));
  };

  const setChatCustomModel = (model: CustomModelConfig) => {
    setSettings(prev => ({
      ...prev,
      chatApiConfig: {
        ...prev.chatApiConfig,
        modelName: model.modelName,
        presetId: model.id,
        endpointUrl: model.endpointUrl,
        apiKey: model.apiKey || prev.chatSavedApiKeys?.[model.id] || '',
        apiProvider: 'laozhang',
      },
    }));
  };

  const patchConversation = (id: string, updater: (c: ChatConversation) => ChatConversation) => {
    setConversations(prev =>
      prev.map(c => (c.id === id ? updater({ ...c }) : c)).sort((a, b) => b.updatedAt - a.updatedAt),
    );
  };

  const toggleSkillPackForConversation = (packId: string, checked: boolean) => {
    if (!activeConversationId) return;
    patchConversation(activeConversationId, c => {
      const allIds = skillPacks.map(p => p.id);
      let nextIds: string[];
      const cur = c.enabledSkillPackIds;
      if (checked) {
        nextIds = cur === undefined ? allIds : [...new Set([...cur, packId])];
      } else {
        nextIds = cur === undefined ? allIds.filter(id => id !== packId) : cur.filter(id => id !== packId);
      }
      const allSelected =
        allIds.length > 0 &&
        nextIds.length === allIds.length &&
        allIds.every(id => nextIds.includes(id));
      return {
        ...c,
        enabledSkillPackIds: allSelected ? undefined : nextIds,
        updatedAt: Date.now(),
      };
    });
  };

  const isSkillPackEnabledForConv = (conv: ChatConversation | null, packId: string): boolean => {
    if (!conv) return true;
    if (conv.enabledSkillPackIds === undefined) return true;
    return conv.enabledSkillPackIds.includes(packId);
  };

  const ingestSkillZipFile = async (file: File) => {
    setComposerError(null);
    try {
      const pack = await parseSkillZipFile(file);
      setSkillPacks(prev => {
        const next = [pack, ...prev];
        void saveSkillPacks(next);
        return next;
      });
    } catch (err) {
      setComposerError(getErrorMessage(err));
    }
  };

  const handleDeleteSkillPack = async (packId: string) => {
    setSkillPacks(prev => {
      const next = prev.filter(p => p.id !== packId);
      void saveSkillPacks(next);
      return next;
    });
    setConversations(prev =>
      prev.map(c => {
        if (!c.enabledSkillPackIds) return c;
        const next = c.enabledSkillPackIds.filter(id => id !== packId);
        return { ...c, enabledSkillPackIds: next.length ? next : undefined };
      }),
    );
  };

  const handleNewChat = () => {
    const c = newConversation();
    setConversations(prev => [c, ...prev]);
    setActiveConversationId(c.id);
    setComposerError(null);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id);
      if (activeConversationId === id) {
        setActiveConversationId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const startRename = (c: ChatConversation) => {
    setRenamingId(c.id);
    setRenameDraft(c.title);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const t = renameDraft.trim() || '新对话';
    setConversations(prev =>
      prev.map(c => (c.id === renamingId ? { ...c, title: t, updatedAt: Date.now() } : c)),
    );
    setRenamingId(null);
    setRenameDraft('');
  };

  const addAttachmentsFromFiles = async (files: FileList | File[]) => {
    setComposerError(null);
    for (const file of Array.from(files)) {
      if (file.size > CHAT_MAX_ATTACHMENT_BYTES) {
        setComposerError(`「${file.name}」超过 ${Math.round(CHAT_MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB，未添加`);
        continue;
      }
      try {
        const dataUrl = await fileToBase64(file);
        const att: ChatAttachment = {
          kind: attachmentKindFromFile(file),
          mime: file.type || 'application/octet-stream',
          name: file.name?.trim() || `paste-${Date.now()}`,
          dataUrl,
        };
        setPendingAttachments(prev => [...prev, att]);
      } catch (e) {
        setComposerError(`读取文件失败: ${getErrorMessage(e)}`);
      }
    }
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed && pendingAttachments.length === 0) return;

    setComposerError(null);

    const uid = `msg-${Date.now()}-u`;
    const registryEntries: ConversationAttachmentEntry[] = [];
    const userParts: ChatMessagePart[] = [];
    if (trimmed) userParts.push({ type: 'text', text: trimmed });
    for (const att of pendingAttachments) {
      const rid = `att-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      registryEntries.push({
        id: rid,
        messageId: uid,
        name: att.name,
        mime: att.mime,
        kind: att.kind,
        createdAt: Date.now(),
        dataUrl: att.dataUrl,
      });
      userParts.push({
        type: 'attachment',
        attachment: { ...att, registryId: rid },
      });
    }

    const userMessage: ChatMessage = {
      id: uid,
      role: 'user',
      createdAt: Date.now(),
      parts: userParts,
    };

    // 必须在 setState 之前同步算出 messagesForApi：React 18 会延后执行 updater，
    // 若在 updater 里才赋值，下面的请求会先读到初始 []。
    const list = [...conversations];
    let idx =
      activeConversationId !== null
        ? list.findIndex(c => c.id === activeConversationId)
        : -1;

    let conv: ChatConversation;
    let targetConvId: string;

    if (idx === -1) {
      conv = newConversation();
      targetConvId = conv.id;
      list.unshift(conv);
      idx = 0;
      setActiveConversationId(conv.id);
    } else {
      conv = list[idx];
      targetConvId = conv.id;
    }

    const convForSkills: ChatConversation = { ...conv };
    const messagesForApi = [...conv.messages, userMessage];
    const mergedAttachments = [...(conv.attachments || []), ...registryEntries];

    const nextTitle =
      conv.messages.length === 0 && trimmed ? deriveTitle(trimmed) : conv.title;

    list[idx] = {
      ...conv,
      title: nextTitle,
      updatedAt: Date.now(),
      messages: messagesForApi,
      attachments: mergedAttachments,
    };

    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);

    setConversations(sorted);

    setInputText('');
    setPendingAttachments([]);
    setIsSending(true);

    try {
      const skillBlocks = getSkillMarkdownBlocks(convForSkills, skillPacks);

      const newMsgs = await runAgentChatTurn({
        chatApiConfig: chatCfg,
        settings,
        conversationMessages: messagesForApi,
        skillMarkdownBlocks: skillBlocks,
        conversationAttachments: mergedAttachments,
      });
      patchConversation(targetConvId, c => ({
        ...c,
        updatedAt: Date.now(),
        messages: [...c.messages, ...newMsgs],
      }));
    } catch (e) {
      const errText = getErrorMessage(e);
      setComposerError(errText);
      const errMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'assistant',
        createdAt: Date.now(),
        parts: [{ type: 'text', text: `[错误] ${errText}` }],
      };
      patchConversation(targetConvId, c => ({
        ...c,
        updatedAt: Date.now(),
        messages: [...c.messages, errMsg],
      }));
    } finally {
      setIsSending(false);
    }
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSending) void handleSend();
    }
  };

  const handleComposerPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isSending) return;
    const dt = e.clipboardData;
    if (!dt) return;

    const files: File[] = [];
    const seen = new Set<string>();
    const pushFile = (f: File) => {
      const key = `${f.name}\0${f.size}\0${f.lastModified}\0${f.type}`;
      if (seen.has(key)) return;
      seen.add(key);
      files.push(f);
    };

    if (dt.items?.length) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) pushFile(f);
        }
      }
    }
    if (files.length === 0 && dt.files?.length) {
      for (const f of Array.from(dt.files)) pushFile(f);
    }

    if (files.length === 0) return;

    e.preventDefault();
    void addAttachmentsFromFiles(files);
  };

  if (!isActive) return null;

  return (
    <div className="h-full flex flex-row overflow-hidden">
      {/* 左侧：对话模型 */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-gray-800/60">
          <div className="flex items-center gap-1.5">
            <Cpu size={11} className="text-gray-600" />
            <span className="text-[10px] font-bold uppercase font-mono text-gray-500 tracking-wider">
              对话模型
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showAddModel) handleCancelEditCustomModel();
              else setShowAddModel(true);
            }}
            className="p-1 rounded hover:bg-gray-800/60 text-gray-500 hover:text-indigo-400 transition-colors"
            title="添加对话模型"
          >
            <Plus size={13} />
          </button>
        </div>

        {showAddModel && (
          <div className="px-2 py-2 border-b border-gray-800/60 bg-black/20 space-y-1.5 flex-shrink-0">
            <input
              type="text"
              placeholder="显示名称"
              value={newModel.name}
              onChange={e => setNewModel(p => ({ ...p, name: e.target.value }))}
              className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-white outline-none font-mono focus:border-indigo-500 placeholder-gray-600"
            />
            <input
              type="text"
              placeholder="模型名"
              value={newModel.modelName}
              onChange={e => setNewModel(p => ({ ...p, modelName: e.target.value }))}
              className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-white outline-none font-mono focus:border-indigo-500 placeholder-gray-600"
            />
            <input
              type="text"
              placeholder="API（…/v1/chat/completions）"
              value={newModel.endpointUrl}
              onChange={e => setNewModel(p => ({ ...p, endpointUrl: e.target.value }))}
              className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-white outline-none font-mono focus:border-indigo-500 placeholder-gray-600"
            />
            <input
              type="password"
              placeholder="API Key"
              value={newModel.apiKey}
              onChange={e => setNewModel(p => ({ ...p, apiKey: e.target.value }))}
              autoComplete="new-password"
              className="w-full bg-black/50 border border-gray-700 rounded px-2 py-1 text-[10px] text-white outline-none font-mono focus:border-indigo-500 placeholder-gray-600"
            />
            <p className="text-[9px] text-gray-600 leading-tight">
              对话仅支持 OpenAI 兼容 Chat Completions（与生图专用接口不同）。
            </p>
            <button
              type="button"
              onClick={handleSaveCustomModel}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded text-[10px] font-bold transition-colors"
            >
              <Save size={10} /> {editingModelId ? '更新模型' : '保存模型'}
            </button>
            {editingModelId && (
              <button
                type="button"
                onClick={handleCancelEditCustomModel}
                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-gray-800/60 hover:bg-gray-800 text-gray-400 rounded text-[10px] font-bold transition-colors"
              >
                <X size={10} /> 取消
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar py-1.5 px-2 space-y-2">
          {(settings.chatCustomModels?.length ?? 0) === 0 && !showAddModel && (
            <p className="text-[10px] text-gray-600 px-1 py-2 leading-relaxed">
              点击 + 添加中转 Chat 模型（Endpoint 指向 chat/completions）。
            </p>
          )}
          {defaultChatModelRows.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-1 pb-1 flex items-center gap-2 border-b border-gray-800/60">
                <span className="text-[9px] font-bold uppercase font-mono text-gray-500 tracking-wider">默认</span>
              </div>
              {defaultChatModelRows.map(m => {
                const isSelected = chatCfg.presetId === m.id;
                return (
                  <div key={m.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => setChatCustomModel(m)}
                      title={`${m.name}\n${m.endpointUrl}`}
                      className={`flex flex-1 min-w-0 items-center gap-1.5 text-left px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-colors ${
                        isSelected
                          ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/20'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 border border-transparent'
                      }`}
                    >
                      <span className="truncate">{m.name}</span>
                      <span className="shrink-0 px-1 py-px rounded-[3px] text-[8px] font-bold uppercase tracking-wide bg-slate-700/70 text-slate-400 border border-slate-600/40">
                        默认
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditCustomModel(m)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-indigo-400 transition-all"
                      title="编辑"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomModel(m.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                      title="删除"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {otherChatModels.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-1 pb-1 flex items-center gap-2 border-b border-gray-800/60">
                <span className="text-[9px] font-bold uppercase font-mono text-gray-600 tracking-wider">其它</span>
              </div>
              {otherChatModels.map(m => {
                const isSelected = chatCfg.presetId === m.id;
                return (
                  <div key={m.id} className="group flex items-center">
                    <button
                      type="button"
                      onClick={() => setChatCustomModel(m)}
                      title={`${m.name}\n${m.endpointUrl}`}
                      className={`flex-1 text-left px-2.5 py-1.5 rounded-md text-[11px] font-mono transition-colors truncate ${
                        isSelected
                          ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/20'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
                      }`}
                    >
                      {m.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditCustomModel(m)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-indigo-400 transition-all"
                      title="编辑"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomModel(m.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                      title="删除"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <ChatSkillPackPanel
          skillPacks={skillPacks}
          activeConversationId={activeConversationId}
          maxZipBytes={MAX_SKILL_ZIP_BYTES}
          isPackEnabled={id => isSkillPackEnabledForConv(activeConversation, id)}
          onTogglePack={toggleSkillPackForConversation}
          onDeletePack={handleDeleteSkillPack}
          onImportZip={f => void ingestSkillZipFile(f)}
        />

        <div className="flex-shrink-0 border-t border-gray-800/60 px-3 py-2 space-y-2 bg-gray-950/50">
          <div>
            <label className="block text-[9px] text-gray-500 uppercase font-mono mb-1">
              工具 · 生图路线
            </label>
            <select
              value={settings.agentImagePresetId ?? ''}
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  agentImagePresetId: e.target.value ? e.target.value : undefined,
                }))
              }
              className="w-full bg-black/40 border border-gray-700/80 rounded px-2 py-1.5 text-[10px] text-gray-300 outline-none font-mono focus:border-indigo-500 cursor-pointer"
            >
              <option value="">（跟随生图页当前选中）</option>
              {(settings.customModels || []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] text-gray-500 uppercase font-mono mb-1">
              工具 · 视频路线
            </label>
            <select
              value={settings.agentVideoPresetId ?? ''}
              onChange={e =>
                setSettings(prev => ({
                  ...prev,
                  agentVideoPresetId: e.target.value ? e.target.value : undefined,
                }))
              }
              className="w-full bg-black/40 border border-gray-700/80 rounded px-2 py-1.5 text-[10px] text-gray-300 outline-none font-mono focus:border-indigo-500 cursor-pointer"
            >
              <option value="">（跟随视频页当前选中）</option>
              {(settings.videoCustomModels || []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          {(settings.customModels || []).length === 0 && (settings.videoCustomModels || []).length === 0 ? (
            <p className="text-[9px] text-gray-600 leading-snug">
              下拉选项来自各页「已保存模型」。若列表为空，请先到生图 / 视频页保存自定义模型。
            </p>
          ) : null}
        </div>
      </aside>

      {/* 中间：对话 */}
      <div className="relative flex-1 flex flex-col overflow-hidden min-w-0 bg-black">
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-4 min-h-0">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center pointer-events-none select-none opacity-80">
              <MessageSquare size={48} className="text-gray-800 mb-3" />
              <p className="text-[11px] text-gray-600 font-mono tracking-wider">START A CONVERSATION</p>
              <p className="text-[10px] text-gray-700 mt-2 max-w-sm">
                支持文字与附件。对话默认启用 Agent（tools）。侧栏上方导入 Skill ZIP 并勾选本会话要注入的包；下方可选工具生图/视频路线。
              </p>
            </div>
          ) : (
            activeConversation.messages.map(msg => {
              if (msg.role === 'tool') {
                const toolText = msg.parts
                  .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                  .map(p => p.text)
                  .join('\n');
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[min(100%,42rem)] rounded-2xl px-3 py-2 text-[13px] leading-relaxed bg-gray-950/90 border border-amber-900/30 text-gray-200">
                      <div className="text-[9px] font-mono text-amber-500/90 mb-1 uppercase tracking-wide">
                        tool · {msg.toolCallId || '?'}
                      </div>
                      <ToolResultBody text={toolText} />
                    </div>
                  </div>
                );
              }

              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[min(100%,42rem)] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                      isUser
                        ? 'bg-indigo-600/25 border border-indigo-500/25 text-gray-100'
                        : 'bg-gray-900/80 border border-gray-800 text-gray-200'
                    }`}
                  >
                    {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <details className="mb-2 text-[10px] font-mono text-amber-200/90 border border-amber-900/35 rounded-lg p-2 bg-black/30">
                        <summary className="cursor-pointer select-none">
                          函数调用 ({msg.toolCalls.length})
                        </summary>
                        <ul className="mt-1.5 space-y-1.5 text-gray-400">
                          {msg.toolCalls.map(tc => (
                            <li key={tc.id}>
                              <span className="text-amber-400/90 font-bold">{tc.name}</span>
                              <pre className="mt-0.5 whitespace-pre-wrap break-all text-[9px] text-gray-500 max-h-24 overflow-y-auto custom-scrollbar">
                                {tc.arguments}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {msg.parts.map((part, i) => {
                      if (part.type === 'text') {
                        if (isUser) {
                          return (
                            <p key={i} className="whitespace-pre-wrap break-words font-sans">
                              {part.text}
                            </p>
                          );
                        }
                        return <GitHubMarkdown key={i} markdown={part.text} />;
                      }
                      const { attachment: a } = part;
                      if (a.kind === 'image') {
                        return (
                          <div key={i} className="mt-2 rounded-lg overflow-hidden border border-gray-700/60 max-h-64">
                            <img src={a.dataUrl} alt={a.name} className="max-w-full max-h-64 object-contain" />
                          </div>
                        );
                      }
                      if (a.kind === 'video') {
                        return (
                          <div key={i} className="mt-2 rounded-lg overflow-hidden border border-gray-700/60 max-w-full">
                            <video src={a.dataUrl} controls className="max-w-full max-h-56" />
                            <p className="text-[10px] text-gray-500 px-2 py-1 font-mono truncate">{a.name}</p>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={i}
                          className="mt-2 flex items-center gap-2 px-2 py-1.5 rounded-md bg-black/40 border border-gray-700/50 text-[11px] text-gray-400 font-mono"
                        >
                          <Paperclip size={12} className="shrink-0" />
                          <span className="truncate">{a.name}</span>
                          <span className="text-gray-600 shrink-0">{a.mime}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollEndRef} />
        </div>

        {composerError && (
          <div className="px-4 pb-1">
            <p className="text-[10px] text-red-400 font-mono">{composerError}</p>
          </div>
        )}

        <div className="flex-shrink-0 border-t border-gray-800/80 px-3 py-2 bg-gray-950/80">
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pendingAttachments.map((a, idx) => (
                <div
                  key={`${a.name}-${idx}`}
                  className="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-gray-800/80 border border-gray-700 text-[10px] text-gray-300 font-mono max-w-[200px]"
                >
                  <span className="truncate">{a.name}</span>
                  <button
                    type="button"
                    onClick={() => setPendingAttachments(p => p.filter((_, i) => i !== idx))}
                    className="p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-white"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <label className="p-2 rounded-lg border border-gray-700 bg-black/40 text-gray-500 hover:text-indigo-400 hover:border-indigo-500/40 cursor-pointer transition-colors shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,video/*,*/*"
                onChange={e => {
                  const fl = e.target.files;
                  if (fl?.length) void addAttachmentsFromFiles(fl);
                  e.target.value = '';
                }}
              />
              <Paperclip size={16} />
            </label>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              onPaste={handleComposerPaste}
              placeholder="输入消息…（Enter 发送，Shift+Enter 换行；可粘贴图片/文件为附件）"
              rows={6}
              disabled={isSending}
              className="flex-1 bg-black/40 border border-gray-700/80 rounded-lg px-3 py-2 text-[13px] text-gray-200 placeholder-gray-600 outline-none focus:border-indigo-500 resize-y min-h-[132px] max-h-[40vh] custom-scrollbar"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isSending || (!inputText.trim() && pendingAttachments.length === 0)}
              className={`shrink-0 p-2.5 rounded-lg flex items-center justify-center transition-colors ${
                isSending || (!inputText.trim() && pendingAttachments.length === 0)
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {isSending ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>

        {isSending && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-black/20" />
        )}
      </div>

      {/* 右侧：会话列表 */}
      {showSidebar && (
        <aside className="w-56 flex-shrink-0 border-l border-gray-800 bg-gray-900/40 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800/60 flex-shrink-0 gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <MessageSquare size={11} className="text-cyan-400 shrink-0" />
              <span className="text-[10px] font-bold text-gray-500 uppercase font-mono tracking-wider truncate">
                会话
              </span>
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              className="text-[10px] font-bold px-2 py-1 rounded bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 shrink-0"
            >
              新对话
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 custom-scrollbar">
            {conversations.length === 0 ? (
              <p className="text-[10px] text-gray-600 px-1 py-2">暂无会话，点击「新对话」开始。</p>
            ) : (
              [...conversations]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map(c => {
                  const sel = c.id === activeConversationId;
                  return (
                    <div
                      key={c.id}
                      className={`group rounded-md border flex flex-col gap-0.5 transition-colors ${
                        sel
                          ? 'border-cyan-500/40 bg-cyan-950/30'
                          : 'border-transparent hover:border-gray-700 bg-gray-950/20'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveConversationId(c.id);
                          setComposerError(null);
                        }}
                        className="text-left px-2 py-1.5 w-full"
                      >
                        {renamingId === c.id ? (
                          <input
                            value={renameDraft}
                            onChange={e => setRenameDraft(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') {
                                setRenamingId(null);
                                setRenameDraft('');
                              }
                            }}
                            className="w-full bg-black/50 border border-gray-600 rounded px-1 py-0.5 text-[11px] text-white font-mono"
                            autoFocus
                            onClick={ev => ev.stopPropagation()}
                          />
                        ) : (
                          <span className="text-[11px] font-mono text-gray-200 line-clamp-2">{c.title}</span>
                        )}
                        <span className="text-[9px] text-gray-600 font-mono mt-0.5 block">
                          {new Date(c.updatedAt).toLocaleString()}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 px-2 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => startRename(c)}
                          className="text-[9px] text-gray-500 hover:text-indigo-400 font-mono px-1"
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteConversation(c.id)}
                          className="text-[9px] text-gray-500 hover:text-red-400 font-mono px-1"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </aside>
      )}
    </div>
  );
};

export default ChatView;
