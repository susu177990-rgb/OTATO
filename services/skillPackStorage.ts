import { get, set } from 'idb-keyval';
import type { SkillPackRecord } from '../types';

export const SKILL_PACKS_KEY = 'otato_agent_skill_packs';

export async function loadSkillPacks(): Promise<SkillPackRecord[]> {
  try {
    const raw = await get(SKILL_PACKS_KEY);
    if (Array.isArray(raw)) return raw as SkillPackRecord[];
  } catch {
    /* ignore */
  }
  return [];
}

export async function saveSkillPacks(packs: SkillPackRecord[]): Promise<void> {
  await set(SKILL_PACKS_KEY, packs);
}
