const path = require('path');
const webpack = require('webpack');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV === "production"? "production" : "development",
    target: "electron-renderer",
    entry: path.resolve(__dirname, './src/renderer/index.ts'),
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: [/node_modules/, /lib/],
            },
        ],
    },
    output: {
        path: path.resolve(__dirname, './lib/renderer'),
        filename: 'index.js',
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    plugins: [
        new webpack.SourceMapDevToolPlugin({
            filename: '[file].map',
        }),
        new webpack.DefinePlugin({
            global: 'window',
        }),
        new CleanWebpackPlugin(),
        new CopyWebpackPlugin([{
            from:  path.resolve(__dirname, 'src/renderer/assets'),
            to:  path.resolve(__dirname, 'lib/renderer/assets'),
        },{
            from:  path.resolve(__dirname, 'src/renderer/index.html'),
            to:  path.resolve(__dirname, 'lib/renderer/index.html'),
        }])
    ],
};
