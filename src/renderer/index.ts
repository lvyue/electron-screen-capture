import { ipcRenderer, clipboard, nativeImage, remote, desktopCapturer } from 'electron';
import fs from 'fs';
import { TakeScreenData } from '../shares/types';
import { CaptureEditor } from './editor';
import { Rect, TakeScreenScope } from './types';

const $canvas: HTMLCanvasElement | null = document.getElementById('js-canvas') as HTMLCanvasElement | null;
const $mask = document.getElementById('js-mask');
const $bg = document.getElementById('js-bg');
const $sizeInfo = document.getElementById('js-size-info');
const $toolbar = document.getElementById('js-toolbar');

const $btnClose = document.getElementById('js-tool-close');
const $btnOk = document.getElementById('js-tool-ok');
const $btnSave = document.getElementById('js-tool-save');
const $btnReset = document.getElementById('js-tool-reset');
const $btnRect = document.getElementById('js-tool-rect');
const $btnLine = document.getElementById('js-tool-line');
const $btnEllipse = document.getElementById('js-tool-ellipse');
const $btnArrow = document.getElementById('js-tool-arrow');

const audio = new Audio();
audio.src = './assets/audio/capture.mp3';

// 右键取消截屏
document.body.addEventListener(
    'mousedown',
    (e) => {
        if (e.button === 2) {
            ipcRenderer.send('screen-capture::action', {
                type: 'cancel',
            });
        }
    },
    true,
);

document.body.addEventListener(
    'keydown',
    (e) => {
        if (e.keyCode === 27) {
            ipcRenderer.send('screen-capture::action', {
                type: 'cancel',
            });
        }
    },
    true,
);

const handleError = (e: Error) => {
    ipcRenderer.send('screen-capture::action', {
        type: 'error',
        error: e.stack || e.message,
    });
};

const handleStream = (stream: MediaStream, scope: TakeScreenScope) => {
    const { display } = scope;
    document.body.style.opacity = '1';
    // Create hidden video tag
    const video = document.createElement('video');
    video.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';
    console.log('handleStream', stream);
    // Event connected to stream
    video.addEventListener('play', function () {
        video.style.height = `${video.videoHeight}px`; // videoHeight
        video.style.width = `${video.videoWidth}px`; // videoWidth
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }
        // // Draw video on canvas
        ctx.drawImage(video, 0, 0);
        const dataURL = canvas.toDataURL('image/png');
        video.pause();
        video.remove();
        try {
            stream.getTracks()[0].stop();
        } catch (e) {}
        ipcRenderer.send('screen-capture::action', { type: 'full', screenId: scope._id });
        if (
            $canvas &&
            $bg &&
            $mask &&
            $btnRect &&
            $btnLine &&
            $btnEllipse &&
            $btnArrow &&
            $toolbar &&
            $sizeInfo &&
            $btnClose &&
            $btnReset &&
            $btnOk &&
            $btnSave
        ) {
            $canvas.height = scope.height;
            $canvas.width = scope.width;
            $canvas.style.height = `${scope.height / scope.scale}px`;
            $canvas.style.width = `${scope.width / scope.scale}px`;
            // create class
            const capture = new CaptureEditor($canvas, $bg, dataURL, display);
            $mask.style.display = 'block';

            $btnRect.addEventListener('click', () => {
                capture.drawRectangle();
            });
            $btnLine.addEventListener('click', () => {
                capture.drawLine();
            });
            $btnEllipse.addEventListener('click', () => {
                capture.drawEllipse();
            });
            $btnArrow.addEventListener('click', () => {
                capture.drawArrow();
            });

            const onDrag = (selectRect: Rect) => {
                $toolbar.style.display = 'none';
                $sizeInfo.style.display = 'block';
                $sizeInfo.innerText = `${selectRect.w} * ${selectRect.h}`;
                if (selectRect.y > 35) {
                    $sizeInfo.style.top = `${selectRect.y - 30}px`;
                } else {
                    $sizeInfo.style.top = `${selectRect.y + 10}px`;
                }
                $sizeInfo.style.left = `${selectRect.x}px`;
            };
            capture.on('start-dragging', onDrag);
            capture.on('dragging', onDrag);

            const onDragEnd = () => {
                if (capture.selectRect) {
                    ipcRenderer.send('screen-capture::action', {
                        type: 'select',
                        screenId: display.id,
                    });
                    const { b, x } = capture.selectRect;
                    $toolbar.style.top = `${b + 15}px`;
                    $toolbar.style.left = `${x}px`;
                    $toolbar.style.display = 'flex';
                }
            };
            capture.on('end-dragging', onDragEnd);

            ipcRenderer.on('screen-capture::action', (e, { type, screenId }) => {
                if (type === 'select') {
                    if (screenId && screenId !== display.id) {
                        capture.disable();
                    }
                }
            });

            capture.on('reset', () => {
                $toolbar.style.display = 'none';
                $sizeInfo.style.display = 'none';
            });

            $btnClose.addEventListener('click', () => {
                ipcRenderer.send('screen-capture::action', {
                    type: 'cancel',
                });
            });

            $btnReset.addEventListener('click', () => {
                capture.reset();
            });

            const selectCapture = () => {
                if (!capture.selectRect) {
                    return;
                }
                const url = capture.getImageUrl();
                remote.getCurrentWindow().hide();

                audio.play();
                audio.onended = () => {
                    window.close();
                };
                clipboard.writeImage(nativeImage.createFromDataURL(url));
                ipcRenderer.send('screen-capture::action', {
                    type: 'complete',
                    url,
                });
            };
            $btnOk.addEventListener('click', selectCapture);

            $btnSave.addEventListener('click', () => {
                const url = capture.getImageUrl();
                remote.dialog
                    .showSaveDialog(remote.getCurrentWindow(), {
                        filters: [
                            {
                                name: 'Images',
                                extensions: ['png', 'jpg', 'gif'],
                            },
                        ],
                    })
                    .then(({ canceled, filePath }) => {
                        if (canceled || !filePath) {
                            ipcRenderer.send('screen-capture::action', {
                                type: 'cancel',
                                url,
                            });
                            return;
                        }
                        fs.writeFile(filePath, Buffer.from(url.replace('data:image/png;base64,', ''), 'base64'), () => {
                            ipcRenderer.send('screen-capture::action', {
                                type: 'complete',
                                url,
                                path: filePath,
                            });
                        });
                    })
                    .catch(handleError);
            });
            window.addEventListener('keypress', (e) => {
                if (e.code === 'Enter') {
                    selectCapture();
                }
            });
        }
    });
    video.onloadedmetadata = () => {
        video.play();
    };
    video.srcObject = stream;
    document.body.appendChild(video);
};

ipcRenderer.on('screen-capture::take-screen', (events, data: TakeScreenData) => {
    const { display, maxWidth, maxHeight, _id, index } = data;
    const { id, bounds, workArea, scaleFactor } = display;
    const area = process.platform === 'linux' ? workArea : bounds;
    const scope: TakeScreenScope = {
        id,
        scaleFactor,
        x: area.x * (scaleFactor >= 1 ? scaleFactor : 1),
        y: area.y * (scaleFactor >= 1 ? scaleFactor : 1),
        width: area.width * scaleFactor,
        height: area.height * scaleFactor,
        scale: scaleFactor,
        display,
        _id,
    };

    // mac 和 windows 获取 chromeMediaSourceId 的方式不同
    desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
            let selectSource = sources.filter((source) => `${source.display_id}` === _id)[0];
            if (!selectSource) {
                selectSource = sources[index];
            }
            navigator.mediaDevices
                .getUserMedia({
                    audio: false,
                    video: {
                        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                        //@ts-ignore
                        mandatory: {
                            chromeMediaSource: 'desktop',
                            chromeMediaSourceId: selectSource.id,
                            minWidth: scope.width,
                            minHeight: scope.height,
                            maxWidth,
                            maxHeight,
                        },
                    },
                })
                .then((stream) => handleStream(stream, scope))
                .catch((e) => handleError(e));
        })
        .catch((e) => handleError(e));
});
