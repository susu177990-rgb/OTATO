import React, { useState, useEffect } from 'react';
import { Layers, Zap, Image, Settings as SettingsIcon } from 'lucide-react';
import { get, set } from 'idb-keyval';
import Generator from './components/Generator';
import Gallery from './components/Gallery';
import Settings from './components/Settings';
import { GeneratedImage, LogEntry, AppSettings } from './types';
import { DEFAULT_APP_SETTINGS } from './constants';
import { persistImage, loadAllImages, deletePersistedImage } from './services/imageStorage';
import { getErrorMessage } from './utils/errorUtils';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<'GENERATE' | 'GALLERY' | 'SETTINGS'>('GENERATE');
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'SAVED' | 'SAVING'>('SAVED');

  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', timestamp: new Date().toLocaleTimeString(), level: 'INFO', message: '系统已初始化' },
  ]);

  const addLog = (entry: LogEntry) => {
    setLogs(prev => [...prev, entry]);
  };

  const addGeneratedImage = async (img: GeneratedImage) => {
    await persistImage(img);
    setGeneratedImages(prev => [...prev, img]);
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
        .catch((e) => {
          addLog({ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString(), level: 'ERROR', message: `保存设置失败: ${getErrorMessage(e)}` });
          setSaveStatus('SAVED');
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, [appSettings, isLoaded]);

  if (!isLoaded) {
    return <div className="h-screen w-screen bg-black flex items-center justify-center text-indigo-500 font-mono">LOADING...</div>;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black font-sans text-gray-100 selection:bg-indigo-500 selection:text-white">

      <nav className="w-16 md:w-20 border-r border-gray-800 flex flex-col items-center py-6 bg-gray-900/50 backdrop-blur-md z-50">
        <div className="mb-8 p-2 bg-indigo-600 rounded-lg shadow-[0_0_15px_rgba(79,70,229,0.5)]">
          <Layers className="text-white" size={24} />
        </div>

        <div className="flex-1 flex flex-col gap-6 w-full">
          <NavIcon
            icon={<Zap size={24} />}
            label="生图"
            isActive={activeView === 'GENERATE'}
            onClick={() => setActiveView('GENERATE')}
          />
          <NavIcon
            icon={<Image size={24} />}
            label="画廊"
            isActive={activeView === 'GALLERY'}
            onClick={() => setActiveView('GALLERY')}
          />
        </div>

        <div className="mt-auto flex flex-col items-center gap-4">
          <div className="text-[9px] font-mono text-gray-600 flex flex-col items-center">
            <div className={`w-2 h-2 rounded-full mb-1 ${saveStatus === 'SAVED' ? 'bg-green-900 border border-green-600' : 'bg-yellow-600 animate-pulse'}`}></div>
            {saveStatus}
          </div>
          <NavIcon
            icon={<SettingsIcon size={24} />}
            label="设置"
            isActive={activeView === 'SETTINGS'}
            onClick={() => setActiveView('SETTINGS')}
          />
        </div>
      </nav>

      <main className="flex-1 relative overflow-hidden bg-gray-950">

        <div className={`h-full w-full ${activeView === 'GENERATE' ? 'block' : 'hidden'}`}>
          <Generator
            isActive={activeView === 'GENERATE'}
            settings={appSettings}
            setSettings={setAppSettings}
            addLog={addLog}
            logs={logs}
            addGeneratedImage={addGeneratedImage}
          />
        </div>

        <div className={`h-full w-full ${activeView === 'GALLERY' ? 'block' : 'hidden'}`}>
          <Gallery images={generatedImages} onDelete={handleDeleteImage} addLog={addLog} />
        </div>

        <div className={`h-full w-full ${activeView === 'SETTINGS' ? 'block' : 'hidden'}`}>
          <Settings settings={appSettings} setSettings={setAppSettings} />
        </div>

      </main>
    </div>
  );
};

const NavIcon: React.FC<{ icon: React.ReactNode, label: string, isActive: boolean, onClick: () => void }> = ({ icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`group relative w-full flex flex-col items-center justify-center gap-1 py-3 transition-all ${isActive ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}
  >
    <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-indigo-900/30' : 'group-hover:bg-gray-800'}`}>
      {icon}
    </div>
    <span className="text-[10px] font-medium tracking-wide">{label}</span>
    {isActive && (
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-indigo-500 rounded-r-full" />
    )}
  </button>
);

export default App;
