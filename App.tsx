import React, { useState, useEffect, useRef } from 'react';
import { Layers, Zap, Image, Terminal, Film, MessageSquare } from 'lucide-react';
import { get, set } from 'idb-keyval';
import Generator from './components/Generator';
import VideoGenerator from './components/VideoGenerator';
import ChatView from './components/ChatView';
import Gallery from './components/Gallery';
import { GeneratedImage, LogEntry, AppSettings } from './types';
import { DEFAULT_APP_SETTINGS, DEFAULT_FIXED_CHAT_CUSTOM_MODELS, DEFAULT_FIXED_CUSTOM_MODELS } from './constants';
import { persistImage, loadAllImages, deletePersistedImage, clearPersistedImages } from './services/imageStorage';
import { getErrorMessage } from './utils/errorUtils';

function normalizeLoadedSettings(raw: Partial<AppSettings>): AppSettings {
  const customModelsRaw =
    raw.customModels !== undefined ? raw.customModels : (DEFAULT_APP_SETTINGS.customModels ?? []);
  let customModels = [...customModelsRaw];
  for (let i = DEFAULT_FIXED_CUSTOM_MODELS.length - 1; i >= 0; i--) {
    const fixed = DEFAULT_FIXED_CUSTOM_MODELS[i];
    if (!customModels.some(m => m.id === fixed.id)) {
      customModels = [fixed, ...customModels];
    }
  }
  const videoCustomModels = raw.videoCustomModels ?? [];
  let agentImagePresetId = raw.agentImagePresetId;
  if (agentImagePresetId && !customModels.some(m => m.id === agentImagePresetId)) {
    agentImagePresetId = undefined;
  }
  let agentVideoPresetId = raw.agentVideoPresetId;
  if (agentVideoPresetId && !videoCustomModels.some(m => m.id === agentVideoPresetId)) {
    agentVideoPresetId = undefined;
  }

  const chatCustomModelsRaw =
    raw.chatCustomModels !== undefined ? raw.chatCustomModels : (DEFAULT_APP_SETTINGS.chatCustomModels ?? []);
  let chatCustomModels = [...chatCustomModelsRaw];
  for (let i = DEFAULT_FIXED_CHAT_CUSTOM_MODELS.length - 1; i >= 0; i--) {
    const fixed = DEFAULT_FIXED_CHAT_CUSTOM_MODELS[i];
    if (!chatCustomModels.some(m => m.id === fixed.id)) {
      chatCustomModels = [fixed, ...chatCustomModels];
    }
  }

  return {
    ...DEFAULT_APP_SETTINGS,
    ...raw,
    apiConfig: { ...DEFAULT_APP_SETTINGS.apiConfig, ...(raw.apiConfig || {}) },
    chatApiConfig: { ...DEFAULT_APP_SETTINGS.chatApiConfig, ...(raw.chatApiConfig || {}) },
    videoApiConfig: raw.videoApiConfig
      ? { ...DEFAULT_APP_SETTINGS.videoApiConfig!, ...raw.videoApiConfig }
      : DEFAULT_APP_SETTINGS.videoApiConfig,
    savedApiKeys: { ...DEFAULT_APP_SETTINGS.savedApiKeys, ...(raw.savedApiKeys || {}) },
    savedUrls: { ...DEFAULT_APP_SETTINGS.savedUrls, ...(raw.savedUrls || {}) },
    chatSavedApiKeys: { ...DEFAULT_APP_SETTINGS.chatSavedApiKeys, ...(raw.chatSavedApiKeys || {}) },
    chatSavedUrls: { ...DEFAULT_APP_SETTINGS.chatSavedUrls, ...(raw.chatSavedUrls || {}) },
    customModels,
    chatCustomModels,
    videoCustomModels,
    agentImagePresetId,
    agentVideoPresetId,
  };
}

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'GENERATE' | 'GALLERY' | 'VIDEO' | 'CHAT'>('GENERATE');
  const [showLogs, setShowLogs] = useState(true);
  const [showChatSidebar, setShowChatSidebar] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'SAVED' | 'SAVING'>('SAVED');
  const logSeqRef = useRef(0);

  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: '系统已初始化' },
  ]);

  const addLog = (entry: LogEntry) => {
    const uniqueEntry = {
      ...entry,
      id: `${entry.id}-${logSeqRef.current++}`
    };
    setLogs(prev => [...prev, uniqueEntry]);
  };

  const addGeneratedImage = async (img: GeneratedImage) => {
    await persistImage(img);
    setGeneratedImages(prev => {
      const next = prev.filter(existing => existing.id !== img.id);
      return [...next, img];
    });
  };

  const handleDeleteImage = async (id: string) => {
    await deletePersistedImage(id);
    setGeneratedImages(prev => prev.filter(img => img.id !== id));
  };

  const handleClearImages = async () => {
    await clearPersistedImages();
    setGeneratedImages([]);
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const localSettingsStr = localStorage.getItem('otato_appSettings');
        if (localSettingsStr) {
          try {
            const localSettings = JSON.parse(localSettingsStr) as Partial<AppSettings>;
            setAppSettings(normalizeLoadedSettings(localSettings));
          } catch (e) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `加载设置失败: ${getErrorMessage(e)}` });
          }
        }
        const pSettings = await get('appSettings');
        if (pSettings && typeof pSettings === 'object' && !localSettingsStr) {
          setAppSettings(normalizeLoadedSettings(pSettings as Partial<AppSettings>));
        }
        const images = await loadAllImages();
        setGeneratedImages(images);
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'SUCCESS', message: `本地数据已加载，共 ${images.length} 张图` });
      } catch (e) {
        addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `加载本地数据失败: ${getErrorMessage(e)}` });
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    setSaveStatus('SAVING');
    localStorage.setItem('otato_appSettings', JSON.stringify(appSettings));
    const timer = setTimeout(() => {
      set('appSettings', appSettings)
        .then(() => setSaveStatus('SAVED'))
        .catch(e => {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `保存设置失败: ${getErrorMessage(e)}` });
          setSaveStatus('SAVED');
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, [appSettings, isLoaded]);

  if (!isLoaded) {
    return <div className="h-screen w-screen bg-black flex items-center justify-center text-indigo-500 font-mono text-sm tracking-widest">LOADING...</div>;
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-black font-sans text-gray-100 selection:bg-indigo-500/40">

      {/* ── 顶部导航栏 ── */}
      <header className="flex-shrink-0 h-11 border-b border-gray-800/80 bg-gray-950 flex items-center px-3 gap-1 z-40">
        {/* Logo */}
        <div className="p-1.5 bg-indigo-600 rounded-md mr-2 shadow-[0_0_12px_rgba(79,70,229,0.5)]">
          <Layers className="text-white" size={15} />
        </div>

        {/* 页面 tabs */}
        <TabBtn icon={<Zap size={13} />} label="生图" active={activeView === 'GENERATE'} onClick={() => setActiveView('GENERATE')} />
        <TabBtn icon={<Film size={13} />} label="视频" active={activeView === 'VIDEO'} onClick={() => setActiveView('VIDEO')} />
        <TabBtn icon={<MessageSquare size={13} />} label="对话" active={activeView === 'CHAT'} onClick={() => setActiveView('CHAT')} />
        <TabBtn icon={<Image size={13} />} label="画廊" active={activeView === 'GALLERY'} onClick={() => setActiveView('GALLERY')} />

        <div className="flex-1" />

        {/* 右侧工具区 */}
        <div className="flex items-center gap-1">
          {/* 保存状态点 */}
          <div
            title={saveStatus === 'SAVED' ? '已同步' : '保存中...'}
            className={`w-1.5 h-1.5 rounded-full mr-2 transition-colors ${saveStatus === 'SAVED' ? 'bg-green-600' : 'bg-yellow-500 animate-pulse'}`}
          />

          {/* LOGS / 会话侧栏 */}
          {(activeView === 'GENERATE' || activeView === 'VIDEO') && (
            <button
              onClick={() => setShowLogs(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors ${
                showLogs ? 'bg-gray-800 text-gray-200' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <Terminal size={12} /> LOGS
            </button>
          )}
          {activeView === 'CHAT' && (
            <button
              onClick={() => setShowChatSidebar(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors ${
                showChatSidebar ? 'bg-gray-800 text-gray-200' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <MessageSquare size={12} /> 会话
            </button>
          )}
        </div>
      </header>

      {/* ── 主内容区 ── */}
      <main className="flex-1 overflow-hidden">
        <div className={`h-full w-full ${activeView === 'GENERATE' ? 'block' : 'hidden'}`}>
          <Generator
            isActive={activeView === 'GENERATE'}
            settings={appSettings}
            setSettings={setAppSettings}
            addLog={addLog}
            logs={logs}
            addGeneratedImage={addGeneratedImage}
            showLogs={showLogs}
          />
        </div>
        <div className={`h-full w-full ${activeView === 'VIDEO' ? 'block' : 'hidden'}`}>
          <VideoGenerator
            isActive={activeView === 'VIDEO'}
            settings={appSettings}
            setSettings={setAppSettings}
            addLog={addLog}
            logs={logs}
            addGeneratedImage={addGeneratedImage}
            showLogs={showLogs}
          />
        </div>
        <div className={`h-full w-full ${activeView === 'GALLERY' ? 'block' : 'hidden'}`}>
          <Gallery images={generatedImages} onDelete={handleDeleteImage} onClear={handleClearImages} addLog={addLog} />
        </div>
        <div className={`h-full w-full ${activeView === 'CHAT' ? 'block' : 'hidden'}`}>
          <ChatView
            isActive={activeView === 'CHAT'}
            settings={appSettings}
            setSettings={setAppSettings}
            showSidebar={showChatSidebar}
          />
        </div>
      </main>
    </div>
  );
};

const TabBtn: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors ${
      active ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
    }`}
  >
    {icon}{label}
  </button>
);

export default App;
