import React, { useState } from 'react';
import { AppSettings, ApiProviderType } from '../types';
import { Library, Key, Server, Check } from 'lucide-react';
import { clear } from 'idb-keyval';
import { GRSAI_DEFAULT_BASE_URL } from '../constants';

interface SettingsProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const LAOZHANG_MODEL_PRESETS = [
  { id: 'nano-banana-2', name: 'Nano Banana 2' },
  { id: 'gemini-3.1-flash-image-preview', name: 'Gemini 3.1 Flash' },
  { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro (Image)' },
];

const GRSAI_MODEL_PRESETS = [
  { id: 'nano-banana-fast', name: 'Nano Banana Fast' },
  { id: 'nano-banana-2', name: 'Nano Banana 2' },
  { id: 'nano-banana', name: 'Nano Banana' },
  { id: 'nano-banana-pro', name: 'Nano Banana Pro' },
  { id: 'nano-banana-pro-vt', name: 'Nano Banana Pro VT' },
  { id: 'nano-banana-pro-cl', name: 'Nano Banana Pro CL' },
  { id: 'nano-banana-pro-vip', name: 'Nano Banana Pro VIP' },
  { id: 'nano-banana-pro-4k-vip', name: 'Nano Banana Pro 4K VIP' },
];

const Settings: React.FC<SettingsProps> = ({ settings, setSettings }) => {
  const [saved, setSaved] = useState(false);

  const handleApiChange = (key: keyof AppSettings['apiConfig'], value: any) => {
    setSettings(prev => ({
      ...prev,
      apiConfig: {
        ...prev.apiConfig,
        [key]: value
      }
    }));
  };

  const handleProviderChange = (provider: ApiProviderType) => {
    setSettings(prev => {
      const next = { ...prev, apiConfig: { ...prev.apiConfig, apiProvider: provider } };
      if (provider === 'grsai') {
        next.apiConfig.baseUrl = GRSAI_DEFAULT_BASE_URL;
        next.apiConfig.modelName = 'nano-banana-fast';
      } else {
        next.apiConfig.baseUrl = '';
        next.apiConfig.modelName = 'gemini-3-pro-image-preview';
      }
      return next;
    });
  };

  const apiProvider = settings.apiConfig.apiProvider ?? 'laozhang';
  const modelPresets = apiProvider === 'grsai' ? GRSAI_MODEL_PRESETS : LAOZHANG_MODEL_PRESETS;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-gray-950">
      <div className="px-8 py-6 border-b border-gray-800 bg-gray-900/50 backdrop-blur z-10 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg"><Library className="text-white" size={20} /></div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">配置中心</h2>
            <p className="text-gray-400 text-xs">管理 API 连接与模型</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => handleProviderChange('laozhang')}
            className={`py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${apiProvider === 'laozhang'
              ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              }`}
          >
            Gemini Negative
          </button>
          <button
            onClick={() => handleProviderChange('grsai')}
            className={`py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${apiProvider === 'grsai'
              ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              }`}
          >
            Grsai Nano Banana
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-2"><Server size={14} /> API Endpoint</label>
            <input
              type="text"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white outline-none font-mono focus:border-indigo-500 transition-colors"
              value={settings.apiConfig.baseUrl}
              onChange={(e) => handleApiChange('baseUrl', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-2"><Key size={14} /> API Key</label>
            <input
              type="password"
              placeholder="sk-..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white outline-none font-mono focus:border-indigo-500 transition-colors"
              value={settings.apiConfig.apiKey}
              onChange={(e) => handleApiChange('apiKey', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-400 flex items-center gap-2"><Check size={14} /> 模型 (Model Name)</label>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {modelPresets.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => handleApiChange('modelName', preset.id)}
                    className={`text-[10px] px-3 py-1.5 rounded-lg border transition-colors ${settings.apiConfig.modelName === preset.id
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                      }`}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="或手动输入任意模型名..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-white outline-none font-mono focus:border-indigo-500 transition-colors"
                value={settings.apiConfig.modelName}
                onChange={(e) => handleApiChange('modelName', e.target.value)}
              />
            </div>
          </div>

          <div className="pt-6 border-t border-gray-800 space-y-3">
            <button
              onClick={handleSave}
              className={`w-full py-3 rounded-lg text-sm font-bold shadow-lg transition-all active:scale-[0.98] ${saved ? 'bg-green-700 text-green-100' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
            >
              {saved ? '✓ 配置已应用（实时生效）' : '确认应用配置'}
            </button>
            <button
              onClick={async () => { if (confirm("重置所有本地数据？此操作不可撤销。")) { await clear(); localStorage.removeItem('otato_appSettings'); window.location.reload(); } }}
              className="w-full py-2 text-red-500/40 hover:text-red-500 text-[10px] transition-colors"
            >
              重置所有本地缓存数据
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
