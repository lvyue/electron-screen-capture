import { Display, Point } from 'electron';
import { EventEmitter } from 'events';
import { Anchor, AnchorPoint, Rect } from './types';

const CREATE_RECT = 1;
const MOVING_RECT = 2;
const RESIZE = 3;

const ANCHORS: Anchor[] = [
    { row: 'x', col: 'y', cursor: 'nwse-resize' },
    { row: '', col: 'y', cursor: 'ns-resize' },
    { row: 'r', col: 'y', cursor: 'nesw-resize' },

    { row: 'x', col: '', cursor: 'ew-resize' },
    { row: 'r', col: '', cursor: 'ew-resize' },

    { row: 'x', col: 'b', cursor: 'nesw-resize' },
    { row: '', col: 'b', cursor: 'ns-resize' },
    { row: 'r', col: 'b', cursor: 'nwse-resize' },
];

export class CaptureEditor extends EventEmitter {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private canvasRect: DOMRect;

    private scaleFactor: number;
    private screenWidth: number;
    private screenHeight: number;
    private style: string;
    private disabled: boolean;

    private backgroundElement: HTMLElement;
    private backgroundImageSrc: string;
    private bgCtx!: CanvasRenderingContext2D;

    private margin: number;
    private enableDraw: boolean;
    private startDraw = false;
    private start!: Point;
    private startPoint: AnchorPoint | null = null;
    private mouseDown = false;

    selectRect: Rect | null = null;

    private selectAnchorIndex = -1;

    private action = 1;

    private imageData!: ImageData;

    private startDragRect: AnchorPoint | null = null;

    private anchors: Array<[number, number]> | null = null;

    constructor(canvas: HTMLCanvasElement, backgroundElement: HTMLElement, imageSrc: string, currentScreen: Display) {
        super();
        this.canvas = canvas;
        this.backgroundImageSrc = imageSrc;
        this.disabled = false;
        this.scaleFactor = currentScreen.scaleFactor;
        this.screenWidth = currentScreen.bounds.width;
        this.screenHeight = currentScreen.bounds.height;
        this.backgroundElement = backgroundElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('get canvas ctx error');
        }
        this.ctx = ctx;
        this.margin = 7;
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.enableDraw = false;
        this.style = '';
        this.canvasRect = this.canvas.getBoundingClientRect();

        Promise.all([this.init(), this.initEvent()]).then(() => {
            console.log('CaptureEditor init');
        });
    }

    init = (): Promise<void> => {
        return new Promise((resolve, reject) => {
            this.backgroundElement.style.backgroundImage = `url(${this.backgroundImageSrc})`;
            this.backgroundElement.style.backgroundSize = `${this.screenWidth}px ${this.screenHeight}px`;
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const image = new Image();
                image.onload = () => {
                    canvas.width = this.screenWidth * this.scaleFactor;
                    canvas.height = this.screenHeight * this.scaleFactor;
                    canvas.style.width = `${this.screenWidth}px`;
                    canvas.style.height = `${this.screenHeight}px`;
                    ctx.drawImage(
                        image,
                        0,
                        0,
                        this.screenWidth * this.scaleFactor,
                        this.screenHeight * this.scaleFactor,
                    );
                    this.bgCtx = ctx;

                    document.addEventListener('mousedown', this.onMouseDown);
                    document.addEventListener('mousemove', this.onMouseMove);
                    document.addEventListener('mouseup', this.onMouseUp);
                    resolve();
                };
                image.onerror = reject;
                image.src = this.backgroundImageSrc;
                return;
            }
            reject(new Error('get background ctx error'));
        });
    };
    initEvent = async (): Promise<void> => {
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.enableDraw) {
                e.preventDefault();
                e.stopPropagation();
                this.startDraw = true;
                const point = this.calcPoint(e);
                if (this.style === 'line') {
                    this.moveTo(point);
                } else if (this.style === 'rect' || this.style === 'ellipse' || this.style === 'arrow') {
                    this.start = point;
                }
            }
        });
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.startDraw) {
                e.preventDefault();
                e.stopPropagation();
                const point = this.calcPoint(e);
                if (this.style === 'line') {
                    this.lineTo(point);
                } else if (this.style === 'rect') {
                    this.strokeRect(point);
                } else if (this.style === 'ellipse') {
                    this.strokeEllipse(point);
                } else if (this.style === 'arrow') {
                    this.strokeArrow(point);
                }
            }
        });
        this.canvas.addEventListener('mouseup', (e) => {
            if (this.startDraw) {
                e.preventDefault();
                e.stopPropagation();
                this.start = { x: 0, y: 0 };
                this.startDraw = false;
                this.getImageData();
                if (this.style === 'line') {
                    this.ctx.closePath();
                }
            }
        });
        this.canvas.addEventListener('mouseout', (e) => {
            if (this.startDraw) {
                e.preventDefault();
                e.stopPropagation();
                this.start = { x: 0, y: 0 };
                this.startDraw = false;
            }
        });
    };

    onMouseDown = (e: MouseEvent): void => {
        if (this.disabled) {
            return;
        }
        this.mouseDown = true;
        const { pageX, pageY } = e;
        if (this.selectRect) {
            const { w, h, x, y, r, b } = this.selectRect;
            if (this.selectAnchorIndex !== -1) {
                this.startPoint = {
                    x: pageX,
                    y: pageY,
                    moved: false,
                    selectRect: {
                        w,
                        h,
                        x,
                        y,
                        r,
                        b,
                    },
                    rawRect: {
                        w,
                        h,
                        x,
                        y,
                        r,
                        b,
                    },
                };
                this.action = RESIZE;
                return;
            }
            this.startPoint = {
                x: e.pageX,
                y: e.pageY,
                moved: false,
                selectRect: {
                    x: 0,
                    y: 0,
                    w: 0,
                    h: 0,
                    r: 0,
                    b: 0,
                },
                rawRect: {
                    w: 0,
                    h: 0,
                    x: 0,
                    y: 0,
                    r: 0,
                    b: 0,
                },
            };
            if (pageX > x && pageX < r && pageY > y && pageY < b) {
                this.action = MOVING_RECT;
                this.startDragRect = {
                    x: pageX,
                    y: pageY,
                    moved: false,
                    selectRect: {
                        x,
                        y,
                        w,
                        h,
                        r,
                        b,
                    },
                    rawRect: {
                        w: 0,
                        h: 0,
                        x: 0,
                        y: 0,
                        r: 0,
                        b: 0,
                    },
                };
            } else {
                this.action = CREATE_RECT;
            }
        } else {
            this.action = CREATE_RECT;
            this.startPoint = {
                x: e.pageX,
                y: e.pageY,
                moved: false,
                selectRect: {
                    x: 0,
                    y: 0,
                    w: 0,
                    h: 0,
                    r: 0,
                    b: 0,
                },
                rawRect: {
                    w: 0,
                    h: 0,
                    x: 0,
                    y: 0,
                    r: 0,
                    b: 0,
                },
            };
            e.stopPropagation();
            e.preventDefault();
        }
    };

    onMouseDrag = (e: MouseEvent): void => {
        if (this.disabled) {
            return;
        }
        e.stopPropagation();
        e.preventDefault();

        const { pageX, pageY } = e;
        let startDragging;
        if (!this.startPoint) {
            return;
        }
        if (!this.startPoint.moved) {
            if (Math.abs(this.startPoint.x - pageX) > 10 || Math.abs(this.startPoint.y - pageY) > 10) {
                this.startPoint.moved = true;
                startDragging = true;
            }
        }
        if (!this.startPoint.moved) {
            return;
        }
        let { selectRect } = this;
        if (this.action === MOVING_RECT) {
            if (!selectRect) {
                return;
            }
            if (!this.startDragRect) {
                return;
            }
            // 移动选区
            if (startDragging) {
                this.emit('start-dragging', selectRect);
            }
            this.emit('dragging', selectRect);
            const { w, h } = selectRect;
            const { x: startX, y: startY } = this.startPoint;
            let newX = this.startDragRect.selectRect.x + (pageX - startX);
            let newY = this.startDragRect.selectRect.y + (pageY - startY);
            let newR = newX + w;
            let newB = newY + h;
            if (newX < 0) {
                newX = 0;
                newR = w;
            } else if (newR > this.screenWidth) {
                newR = this.screenWidth;
                newX = newR - w;
            }
            if (newY < 0) {
                newY = 0;
                newB = h;
            } else if (newB > this.screenHeight) {
                newB = this.screenHeight;
                newY = newB - h;
            }
            this.selectRect = {
                w,
                h,
                x: newX,
                y: newY,
                r: newR,
                b: newB,
            };
            this.drawRect();
        } else if (this.action === RESIZE) {
            if (!selectRect) {
                return;
            }
            this.emit('dragging', selectRect);
            const { row, col } = ANCHORS[this.selectAnchorIndex];
            if (row) {
                this.startPoint.rawRect[row] = this.startPoint.selectRect[row] + (pageX - this.startPoint.x);
                selectRect.x = this.startPoint.rawRect.x;
                selectRect.r = this.startPoint.rawRect.r;
                if (selectRect.x > selectRect.r) {
                    const x = selectRect.r;
                    selectRect.r = selectRect.x;
                    selectRect.x = x;
                }
                selectRect.w = selectRect.r - selectRect.x;
                this.startPoint.rawRect.w = selectRect.w;
            }
            if (col) {
                this.startPoint.rawRect[col] = this.startPoint.selectRect[col] + (pageY - this.startPoint.y);
                selectRect.y = this.startPoint.rawRect.y;
                selectRect.b = this.startPoint.rawRect.b;

                if (selectRect.y > selectRect.b) {
                    const y = selectRect.b;
                    selectRect.b = selectRect.y;
                    selectRect.y = y;
                }
                selectRect.h = selectRect.b - selectRect.y;
                this.startPoint.rawRect.h = selectRect.h;
            }
            this.drawRect();
        } else {
            // 生成选区
            //   const { pageX, pageY } = e;
            let x;
            let y;
            //   let w;
            //   let h;
            let r;
            let b;
            if (this.startPoint.x > pageX) {
                x = pageX;
                r = this.startPoint.x;
            } else {
                r = pageX;
                x = this.startPoint.x;
            }
            if (this.startPoint.y > pageY) {
                y = pageY;
                b = this.startPoint.y;
            } else {
                b = pageY;
                y = this.startPoint.y;
            }
            const w = r - x;
            const h = b - y;

            this.selectRect = {
                x,
                y,
                w,
                h,
                r,
                b,
            };
            selectRect = this.selectRect;
            if (startDragging) {
                this.emit('start-dragging', selectRect);
            }
            this.emit('dragging', selectRect);
            this.drawRect();
        }
    };

    drawRect = (): void => {
        if (this.disabled) {
            return;
        }
        if (!this.selectRect) {
            this.canvas.style.display = 'none';
            return;
        }
        const { x, y, w, h } = this.selectRect;

        const { scaleFactor } = this;
        const radius = 5;
        this.canvas.style.left = `${x - this.margin}px`;
        this.canvas.style.top = `${y - this.margin}px`;
        this.canvas.style.width = `${w + this.margin * 2}px`;
        this.canvas.style.height = `${h + this.margin * 2}px`;
        this.canvas.style.display = 'block';
        this.canvas.width = (w + this.margin * 2) * scaleFactor;
        this.canvas.height = (h + this.margin * 2) * scaleFactor;
        this.canvasRect = this.canvas.getBoundingClientRect();
        if (w && h) {
            const imageData = this.bgCtx.getImageData(
                x * scaleFactor,
                y * scaleFactor,
                w * scaleFactor,
                h * scaleFactor,
            );
            this.ctx.putImageData(imageData, this.margin * scaleFactor, this.margin * scaleFactor);
        }
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#67bade';
        this.ctx.lineWidth = 2 * this.scaleFactor;

        this.ctx.strokeRect(this.margin * scaleFactor, this.margin * scaleFactor, w * scaleFactor, h * scaleFactor);
        if (!this.enableDraw) {
            this.drawAnchors(w, h, this.margin, scaleFactor, radius);
        }
    };

    drawAnchors = (w: number, h: number, margin: number, scaleFactor: number, radius: number): void => {
        if (this.disabled) {
            return;
        }
        if (this.mouseDown && this.action === CREATE_RECT) {
            this.anchors = null;
            return;
        }
        if (!this.selectRect) {
            return;
        }
        this.ctx.beginPath();
        const anchors = [
            [0, 0],
            [w * this.scaleFactor, 0],
            [w * this.scaleFactor, 0],

            [0, h * this.scaleFactor],
            [w * this.scaleFactor, h * this.scaleFactor],

            [0, h * this.scaleFactor],
            [w * this.scaleFactor, h * this.scaleFactor],
            [w * this.scaleFactor, h * this.scaleFactor],
        ];
        this.anchors = anchors.map(([x, y]) => [
            ((this.selectRect || {}).x || 0) + x / scaleFactor,
            ((this.selectRect || {}).y || 0) + y / scaleFactor,
        ]);
        anchors.forEach(([x, y], i) => {
            this.ctx.arc(x + margin * scaleFactor, y + margin * scaleFactor, radius * scaleFactor, 0, 2 * Math.PI);
            const next = anchors[(i + 1) % anchors.length];
            this.ctx.moveTo(next[0] + margin * scaleFactor + radius * scaleFactor, next[1] + margin * scaleFactor);
        });
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
    };

    onMouseMove = (e: MouseEvent): void => {
        if (this.disabled) {
            return;
        }
        if (this.mouseDown) {
            this.onMouseDrag(e);
            return;
        }
        this.selectAnchorIndex = -1;
        if (this.selectRect) {
            const { pageX, pageY } = e;
            const { x, y, r, b } = this.selectRect;
            let selectAnchor;
            let selectIndex = -1;
            if (this.anchors) {
                this.anchors.forEach(([tx, ty], i) => {
                    if (Math.abs(pageX - tx) <= 10 && Math.abs(pageY - ty) <= 10) {
                        selectAnchor = [tx, ty];
                        selectIndex = i;
                    }
                });
            }
            if (selectAnchor) {
                this.selectAnchorIndex = selectIndex;
                document.body.style.cursor = ANCHORS[selectIndex].cursor;
                this.emit('moving');
                return;
            }
            if (pageX > x && pageX < r && pageY > y && pageY < b) {
                document.body.style.cursor = 'move';
            } else {
                document.body.style.cursor = 'auto';
            }
            this.emit('moving');
        }
    };

    onMouseUp = (e: MouseEvent): void => {
        if (this.disabled) {
            return;
        }
        if (!this.mouseDown) {
            return;
        }
        this.mouseDown = false;
        e.stopPropagation();
        e.preventDefault();
        this.emit('mouse-up');
        if (this.startPoint && !this.startPoint.moved) {
            this.emit('end-moving');
            return;
        }
        this.emit('end-dragging');
        this.drawRect();
        this.startPoint = null;
    };

    getImageUrl = (): string => {
        const { scaleFactor, selectRect } = this;
        if (!selectRect) {
            return '';
        }
        const { w, h } = selectRect;
        if (w && h) {
            const imageData = this.getImageData();
            const canvas = document.createElement('canvas');
            canvas.width = w * scaleFactor;
            canvas.height = h * scaleFactor;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return '';
            }
            ctx.putImageData(
                imageData,
                0,
                0,
                (this.margin + 2) * this.scaleFactor,
                (this.margin + 2) * this.scaleFactor,
                w * scaleFactor,
                h * scaleFactor,
            );
            return canvas.toDataURL();
        }
        return '';
    };

    calcPoint = (e: MouseEvent): Point => {
        const rect = this.canvasRect;
        return { x: Math.abs(rect.x - e.clientX), y: Math.abs(rect.y - e.clientY) };
    };
    moveTo = (point: Point): void => {
        this.ctx.beginPath();
        this.ctx.moveTo(point.x * this.scaleFactor, point.y * this.scaleFactor);
    };
    lineTo = (point: Point): void => {
        this.ctx.lineTo(point.x * this.scaleFactor, point.y * this.scaleFactor);
        this.ctx.stroke();
    };
    strokeEllipse = (point: Point): void => {
        const width = (this.start.x - point.x) * this.scaleFactor;
        const height = (this.start.y - point.y) * this.scaleFactor;
        const start = { x: this.start.x * this.scaleFactor, y: this.start.y * this.scaleFactor };
        start.x -= width / 2;
        start.y -= height / 2;
        const { x, y } = start;
        const k = width / 0.75 / 2;
        const h = height / 2;
        this.ctx.putImageData(this.imageData, 0, 0);
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - h);
        this.ctx.bezierCurveTo(x + k, y - h, x + k, y + h, x, y + h);
        this.ctx.bezierCurveTo(x - k, y + h, x - k, y - h, x, y - h);
        this.ctx.closePath();
        this.ctx.stroke();
    };
    strokeRect = (point: Point): void => {
        const width = (this.start.x - point.x) * this.scaleFactor;
        const height = (this.start.y - point.y) * this.scaleFactor;
        const start = { x: this.start.x, y: this.start.y };
        if (width > 0) {
            start.x = point.x;
        }
        if (height > 0) {
            start.y = point.y;
        }
        this.ctx.putImageData(this.imageData, 0, 0);
        this.ctx.strokeRect(start.x * this.scaleFactor, start.y * this.scaleFactor, Math.abs(width), Math.abs(height));
    };

    strokeArrow = (point: Point): void => {
        this.ctx.putImageData(this.imageData, 0, 0);
        const { start } = this;
        // constants (could be declared as globals outside this function)
        const { PI } = Math;
        const degreesInRadians225 = (225 * PI) / 180;
        const degreesInRadians135 = (135 * PI) / 180;

        const degreesInRadians210 = (200 * PI) / 180;
        const degreesInRadians120 = (160 * PI) / 180;

        // calc the angle of the line
        const dx = (point.x - start.x) * this.scaleFactor;
        const dy = (point.y - start.y) * this.scaleFactor;
        const angle = Math.atan2(dy, dx);

        // calc arrowhead points
        const x225 = point.x * this.scaleFactor + 20 * Math.cos(angle + degreesInRadians225);
        const y225 = point.y * this.scaleFactor + 20 * Math.sin(angle + degreesInRadians225);
        const x135 = point.x * this.scaleFactor + 20 * Math.cos(angle + degreesInRadians135);
        const y135 = point.y * this.scaleFactor + 20 * Math.sin(angle + degreesInRadians135);

        const x210 = point.x * this.scaleFactor + 12 * Math.cos(angle + degreesInRadians210);
        const y210 = point.y * this.scaleFactor + 12 * Math.sin(angle + degreesInRadians210);
        const x120 = point.x * this.scaleFactor + 12 * Math.cos(angle + degreesInRadians120);
        const y120 = point.y * this.scaleFactor + 12 * Math.sin(angle + degreesInRadians120);

        // draw line plus arrowhead
        this.ctx.beginPath();
        // draw the line from start to point
        this.ctx.moveTo(start.x * this.scaleFactor, start.y * this.scaleFactor);
        this.ctx.lineTo(x210, y210);
        this.ctx.lineTo(x225, y225);
        this.ctx.lineTo(point.x * this.scaleFactor, point.y * this.scaleFactor);
        // draw partial arrowhead at 135 degrees
        this.ctx.lineTo(x135, y135);
        this.ctx.lineTo(x120, y120);
        this.ctx.lineTo(start.x * this.scaleFactor, start.y * this.scaleFactor);
        this.ctx.closePath();
        // stroke the line and arrowhead
        this.ctx.fill();
    };

    getImageData = (): ImageData => {
        this.imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        return this.imageData;
    };
    drawCommon = (): void => {
        this.enableDraw = true;
        this.drawRect();
        this.disabled = true;
        this.getImageData();
    };

    drawLine = (): void => {
        this.drawCommon();
        this.style = 'line';
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 4 * this.scaleFactor;
    };
    drawRectangle = (): void => {
        this.drawCommon();
        this.style = 'rect';
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 4 * this.scaleFactor;
    };
    drawEllipse = (): void => {
        this.drawCommon();
        this.style = 'ellipse';
        this.ctx.strokeStyle = 'red';
        this.ctx.lineWidth = 4 * this.scaleFactor;
    };

    drawArrow = (): void => {
        this.drawCommon();
        this.style = 'arrow';
        this.ctx.fillStyle = 'red';
    };

    disable = (): void => {
        this.disabled = true;
    };

    enable = (): void => {
        this.disabled = false;
    };

    reset = (): void => {
        this.anchors = null;
        this.startPoint = null;
        this.selectRect = null;
        this.startDragRect = null;
        this.selectAnchorIndex = -1;
        this.drawRect();
        this.emit('reset');
    };
}

export default {
    CREATE_RECT,
    MOVING_RECT,
    RESIZE,
};
