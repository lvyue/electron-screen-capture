import { Display } from 'electron';

export interface TakeScreenData {
    _id: string;
    display: Display;
    index: number;
    maxWidth: number;
    maxHeight: number;
}
