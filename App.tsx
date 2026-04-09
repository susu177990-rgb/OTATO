import React, { useState, useEffect } from 'react';
import { Layers, Zap, Image, Settings as SettingsIcon, Terminal, Film } from 'lucide-react';
import { get, set } from 'idb-keyval';
import Generator from './components/Generator';
import VideoGenerator from './components/VideoGenerator';
import Gallery from './components/Gallery';
import { GeneratedImage, LogEntry, AppSettings } from './types';
import { DEFAULT_APP_SETTINGS } from './constants';
import { persistImage, loadAllImages, deletePersistedImage } from './services/imageStorage';
import { getErrorMessage } from './utils/errorUtils';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'GENERATE' | 'GALLERY' | 'VIDEO'>('GENERATE');
  const [showLogs, setShowLogs] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'SAVED' | 'SAVING'>('SAVED');

  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: '系统已初始化' },
  ]);

  const addLog = (entry: LogEntry) => setLogs(prev => [...prev, entry]);

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

  useEffect(() => {
    const loadData = async () => {
      try {
        const localSettingsStr = localStorage.getItem('otato_appSettings');
        if (localSettingsStr) {
          try {
            const localSettings = JSON.parse(localSettingsStr);
            setAppSettings(prev => ({ ...prev, ...localSettings }));
          } catch (e) {
            addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `加载设置失败: ${getErrorMessage(e)}` });
          }
        }
        const pSettings = await get('appSettings');
        if (pSettings && !localSettingsStr) setAppSettings(pSettings);
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
        <TabBtn icon={<Image size={13} />} label="画廊" active={activeView === 'GALLERY'} onClick={() => setActiveView('GALLERY')} />

        <div className="flex-1" />

        {/* 右侧工具区 */}
        <div className="flex items-center gap-1">
          {/* 保存状态点 */}
          <div
            title={saveStatus === 'SAVED' ? '已同步' : '保存中...'}
            className={`w-1.5 h-1.5 rounded-full mr-2 transition-colors ${saveStatus === 'SAVED' ? 'bg-green-600' : 'bg-yellow-500 animate-pulse'}`}
          />

          {/* LOGS 按钮（仅生图和视频页显示） */}
          {activeView !== 'GALLERY' && (
            <button
              onClick={() => setShowLogs(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide transition-colors ${
                showLogs ? 'bg-gray-800 text-gray-200' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <Terminal size={12} /> LOGS
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
          <Gallery images={generatedImages} onDelete={handleDeleteImage} addLog={addLog} />
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
