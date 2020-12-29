export interface ScreenCaptureConstructorProps {
    /**
     * 插件所在文件夹目录
     * @default __dirname
     */
    dirname?: string;
    /**
     * 添加到剪切板
     * @default true
     */
    addToClipboard?: boolean;
}
