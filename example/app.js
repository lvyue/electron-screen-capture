const { app, BrowserWindow } = require('electron');
const ScreenCapture = require('../lib/main/plugins/ScreenCapture');
const path = require('path');
function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
        },
    });

    win.loadFile('./renderer/index.html');
    win.webContents.on('did-finish-load', () => {
        win.webContents.openDevTools({});
    });
}

app.whenReady().then(() => {
    new ScreenCapture.default({
        dirname: path.resolve(app.getAppPath(), '../lib'),
    });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
