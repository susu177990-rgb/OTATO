import React, { useCallback, useRef, useState } from 'react';
import { Package, Trash2, Upload } from 'lucide-react';
import type { SkillPackRecord } from '../types';

interface ChatSkillPackPanelProps {
  skillPacks: SkillPackRecord[];
  activeConversationId: string | null;
  maxZipBytes: number;
  isPackEnabled: (packId: string) => boolean;
  onTogglePack: (packId: string, enabled: boolean) => void;
  onDeletePack: (packId: string) => void;
  onImportZip: (file: File) => void | Promise<void>;
}

export const ChatSkillPackPanel: React.FC<ChatSkillPackPanelProps> = ({
  skillPacks,
  activeConversationId,
  maxZipBytes,
  isPackEnabled,
  onTogglePack,
  onDeletePack,
  onImportZip,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const maxMb = Math.round(maxZipBytes / 1024 / 1024);

  const pickZipFromList = useCallback((files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      const nameOk = f.name.toLowerCase().endsWith('.zip');
      const typeOk = f.type === 'application/zip' || f.type === 'application/x-zip-compressed';
      if (nameOk || typeOk) {
        void onImportZip(f);
        return;
      }
    }
  }, [onImportZip]);

  return (
    <div className="flex-shrink-0 border-t border-gray-800/60 px-2 py-2.5 space-y-2 bg-black/25">
      <div className="flex items-center gap-2 px-0.5">
        <Package size={12} className="text-indigo-400/90 shrink-0" />
        <span className="text-[10px] font-bold uppercase font-mono text-gray-400 tracking-wider">Skill 包</span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={e => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={e => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (e.dataTransfer.files?.length) pickZipFromList(e.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed px-2 py-3 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors select-none ${
          dragOver
            ? 'border-indigo-500/70 bg-indigo-950/25'
            : 'border-gray-700/80 bg-gray-950/40 hover:border-gray-600 hover:bg-gray-950/70'
        }`}
      >
        <Upload size={18} className={dragOver ? 'text-indigo-300' : 'text-gray-600'} />
        <p className="text-[10px] text-gray-400 font-mono text-center leading-snug">
          点击或拖入 ZIP 导入
        </p>
        <p className="text-[9px] text-gray-600 font-mono text-center">
          须含 SKILL.md · ≤{maxMb}MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onImportZip(f);
          }}
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[9px] font-mono text-gray-600 uppercase tracking-wide">已加载</span>
          <span className="text-[9px] font-mono text-gray-700">{skillPacks.length} 个</span>
        </div>
        <div className="max-h-28 overflow-y-auto space-y-1 custom-scrollbar rounded-md border border-gray-800/50 bg-gray-950/30 p-1">
          {skillPacks.length === 0 ? (
            <p className="text-[9px] text-gray-700 font-mono px-1 py-2 text-center leading-relaxed">
              尚未导入。导入后可在下方勾选本会话要注入的 Skill。
            </p>
          ) : (
            skillPacks.map(p => (
              <div
                key={p.id}
                className="flex items-start gap-1.5 text-[10px] font-mono bg-gray-950/60 rounded px-1.5 py-1 border border-gray-800/60"
              >
                <label className="flex items-start gap-1.5 flex-1 min-w-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPackEnabled(p.id)}
                    disabled={!activeConversationId}
                    onChange={e => onTogglePack(p.id, e.target.checked)}
                    className="mt-0.5 rounded border-gray-600 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-gray-300" title={p.title}>
                      {p.title}
                    </span>
                    <span className="block text-[8px] text-gray-600 mt-px">
                      {new Date(p.importedAt).toLocaleString()}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => onDeletePack(p.id)}
                  className="text-gray-600 hover:text-red-400 shrink-0 p-0.5 rounded hover:bg-gray-800/80 transition-colors"
                  title="从本地移除"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
