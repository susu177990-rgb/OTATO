import { get, set } from 'idb-keyval';
import type { ChatConversation } from '../types';

export const CHAT_STATE_KEY = 'otato_chat_state';
export const CHAT_ACTIVE_LS_KEY = 'otato_chat_active_id';

export interface ChatPersistState {
  conversations: ChatConversation[];
  activeConversationId: string | null;
}

export async function loadChatState(): Promise<ChatPersistState> {
  try {
    const raw = (await get(CHAT_STATE_KEY)) as ChatPersistState | undefined;
    if (raw && Array.isArray(raw.conversations)) {
      return {
        conversations: raw.conversations,
        activeConversationId:
          typeof raw.activeConversationId === 'string' || raw.activeConversationId === null
            ? raw.activeConversationId
            : null,
      };
    }
  } catch {
    /* ignore */
  }
  try {
    const activeLs = localStorage.getItem(CHAT_ACTIVE_LS_KEY);
    return { conversations: [], activeConversationId: activeLs };
  } catch {
    return { conversations: [], activeConversationId: null };
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖写入 IndexedDB，避免每条消息频繁阻塞主线程 */
export function schedulePersistChatState(state: ChatPersistState, delayMs = 450): Promise<void> {
  return new Promise((resolve, reject) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      set(CHAT_STATE_KEY, state)
        .then(() => {
          try {
            if (state.activeConversationId) {
              localStorage.setItem(CHAT_ACTIVE_LS_KEY, state.activeConversationId);
            } else {
              localStorage.removeItem(CHAT_ACTIVE_LS_KEY);
            }
          } catch {
            /* ignore */
          }
          resolve();
        })
        .catch(reject);
    }, delayMs);
  });
}
