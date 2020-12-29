import { TakeScreenData } from '../shares/types';

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    w: number;
    h: number;
    x: number;
    y: number;
    r: number;
    b: number;
}

export interface Anchor {
    row: keyof Rect | '';
    col: keyof Rect | '';
    cursor: string;
}

export interface AnchorPoint extends Point {
    moved: boolean;
    selectRect: Rect;
    rawRect: Rect;
}
export interface TakeScreenScope extends Omit<TakeScreenData, 'index' | 'maxWidth' | 'maxHeight'> {
    id: number;
    scaleFactor: number;
    scale: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
