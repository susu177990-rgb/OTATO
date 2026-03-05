const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

// --- Gallery Image Storage ---
// Images are saved as individual .png files in userData/gallery/
// This avoids bloating IndexedDB with large base64 blobs.

function getGalleryDir() {
  const dir = path.join(app.getPath('userData'), 'gallery');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getImagePath(id) {
  return path.join(getGalleryDir(), `${id}.png`);
}

// Save base64 data URL → local PNG file
ipcMain.handle('fs:saveImage', async (_event, id, base64DataUrl) => {
  try {
    const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(getImagePath(id), buffer);
    return { success: true };
  } catch (e) {
    console.error('fs:saveImage error', e);
    return { success: false, error: e.message };
  }
});

// Load local PNG → base64 data URL
ipcMain.handle('fs:loadImage', async (_event, id) => {
  try {
    const filePath = getImagePath(id);
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (e) {
    console.error('fs:loadImage error', e);
    return null;
  }
});

// Delete a local image file
ipcMain.handle('fs:deleteImage', async (_event, id) => {
  try {
    const filePath = getImagePath(id);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) {
    console.error('fs:deleteImage error', e);
    return { success: false, error: e.message };
  }
});

// List all image IDs that exist on disk
ipcMain.handle('fs:listImages', async () => {
  try {
    const dir = getGalleryDir();
    const files = fs.readdirSync(dir);
    return files
      .filter(f => f.endsWith('.png'))
      .map(f => f.replace('.png', ''));
  } catch (e) {
    console.error('fs:listImages error', e);
    return [];
  }
});

// Show image file in Finder / Explorer
ipcMain.handle('fs:showInFolder', async (_event, id) => {
  try {
    const filePath = getImagePath(id);
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    shell.openPath(getGalleryDir());
    return { success: true };
  } catch (e) {
    console.error('fs:showInFolder error', e);
    return { success: false, error: e.message };
  }
});

// --- Window ---

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:3001');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
