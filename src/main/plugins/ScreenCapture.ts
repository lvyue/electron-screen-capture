import path from 'path';
import { EventEmitter } from 'events';
import { app, ipcMain, clipboard, nativeImage, BrowserWindow, screen, Display } from 'electron';

import os from 'os';
import { ScreenCaptureConstructorProps } from './Types';
import { TakeScreenData } from '../../shares/types';

export default class ScreenCapture extends EventEmitter {
    private active = false;

    private $win: BrowserWindow | null = null;

    private $wins: Record<string, BrowserWindow> = {};

    private dirname = '';

    private displayMap: Record<string, Display> = {};

    private addToClipboard = true;

    constructor({ dirname = path.resolve(__dirname, '../../'), addToClipboard = true }: ScreenCaptureConstructorProps) {
        super();
        if (!app.isReady()) {
            throw new Error("Cannot be executed before app's ready event");
        }
        this.dirname = dirname;
        this.addToClipboard = addToClipboard;
        this.bindCaptureAction();
    }

    private initMultiBrowserWindow = (): void => {
        const displays = screen.getAllDisplays();
        let maxWidth = 0;
        let maxHeight = 0;
        displays.forEach((display) => {
            const dWidth = display.bounds.width * display.scaleFactor;
            const dHeight = display.bounds.height * display.scaleFactor;
            maxWidth = maxWidth > dWidth ? maxWidth : dWidth;
            maxHeight = maxHeight > dHeight ? maxHeight : dHeight;
        });
        displays.forEach((display, index) => {
            const captureWin = new BrowserWindow({
                // window 使用 fullscreen,  mac 设置为 undefined, 不可为 false
                fullscreen: os.platform() === 'win32' || undefined,
                width: display.bounds.width,
                height: display.bounds.height,
                x: display.bounds.x,
                y: display.bounds.y,
                transparent: true,
                frame: false,
                movable: false,
                resizable: false,
                alwaysOnTop: true,
                enableLargerThanScreen: true,
                hasShadow: false,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    enableRemoteModule: true,
                },
            });
            captureWin.setAlwaysOnTop(true, 'floating', 1);
            captureWin.setVisibleOnAllWorkspaces(true);
            // 清除simpleFullscreen状态
            captureWin.on('close', () => captureWin.setSimpleFullScreen(false));
            const editorHtmlPath = `file://${path.resolve(this.dirname, './renderer/index.html')}`;
            console.log('editorHtmlPath ->', editorHtmlPath);
            const { webContents } = captureWin;
            const displayId = `${display.id}`;
            webContents.on('did-finish-load', () => {
                webContents.send('screen-capture::take-screen', {
                    display,
                    maxWidth,
                    maxHeight,
                    _id: displayId,
                    index,
                } as TakeScreenData);
            });
            captureWin.loadURL(editorHtmlPath);
            this.$wins[displayId] = captureWin;
            this.displayMap[displayId] = display;
        });
    };

    /**
     * 调用截图
     */
    take = (): void => {
        if (this.active) {
            return;
        }
        this.active = true;
        this.hide();
        try {
            this.initMultiBrowserWindow();
        } catch (e) {
            console.log(e);
        }
    };

    hide = (): void => {
        const keys = Object.keys(this.$wins);
        keys.forEach((k) => {
            const win = this.$wins[k];
            win.setSimpleFullScreen(false);
            try {
                win.close();
            } catch (error) {}
        });
        this.$wins = {};
    };

    /**
     * 绑定截图确定后的时间回调
     * @param {*} isUseClipboard
     */
    private onScreenCapture = (dataURL: string): void => {
        if (this.addToClipboard) {
            clipboard.writeImage(nativeImage.createFromDataURL(dataURL));
        }
        this.emit('capture', { dataURL });
    };

    private bindCaptureAction = (): void => {
        ipcMain.on('screen-capture::action', (e, { type = 'start', screenId, url, error } = {}) => {
            if (type === 'start') {
                this.take();
            } else if (type === 'complete') {
                this.hide();
                this.onScreenCapture(url);
                this.active = false;
            } else if (type === 'select') {
                Object.keys(this.$wins).forEach((k) => {
                    const win = this.$wins[k];
                    win.webContents.send('screen-capture::action', { type: 'select', screenId });
                });
            } else if (type === 'cancel') {
                this.hide();
                this.active = false;
                this.emit('cancel');
            } else if (type === 'hide') {
                this.hide();
            } else if (type === 'full') {
                const win = this.$wins[screenId];
                if (win) {
                    win.setFullScreen(true);
                    win.show();
                }
            } else if (type === 'error') {
                this.hide();
                this.active = false;
                this.emit('error', error);
            }
        });
    };
}
