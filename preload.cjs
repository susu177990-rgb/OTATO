const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronFS', {
    // 保存图片到本地文件，返回文件路径
    saveImage: (id, base64DataUrl) =>
        ipcRenderer.invoke('fs:saveImage', id, base64DataUrl),

    // 保存缩略图
    saveThumbnail: (id, base64DataUrl) =>
        ipcRenderer.invoke('fs:saveThumbnail', id, base64DataUrl),

    // 读取图片，返回 base64 data URL
    loadImage: (id) =>
        ipcRenderer.invoke('fs:loadImage', id),

    // 读取缩略图（无则回退原图）
    loadThumbnail: (id) =>
        ipcRenderer.invoke('fs:loadThumbnail', id),

    // 删除图片文件
    deleteImage: (id) =>
        ipcRenderer.invoke('fs:deleteImage', id),

    // 列出所有已保存的图片 id
    listImages: () =>
        ipcRenderer.invoke('fs:listImages'),

    // 在访达（Finder）中显示图片文件
    showInFolder: (id) =>
        ipcRenderer.invoke('fs:showInFolder', id),
});
