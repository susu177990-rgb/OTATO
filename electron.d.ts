// Type declarations for the Electron contextBridge API
// exposed by preload.js

interface ElectronFSAPI {
    saveImage: (id: string, base64DataUrl: string) => Promise<{ success: boolean; error?: string }>;
    loadImage: (id: string) => Promise<string | null>;
    deleteImage: (id: string) => Promise<{ success: boolean; error?: string }>;
    listImages: () => Promise<string[]>;
    showInFolder: (id: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
    interface Window {
        electronFS?: ElectronFSAPI;
    }
}

export { };
