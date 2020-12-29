const path = require('path');
const webpack = require('webpack');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV === "production"? "production" : "development",
    entry: path.resolve(__dirname, './src/index.ts'),
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
        library: 'TS',
        path: path.resolve(__dirname, './lib'),
        filename: 'index.umd.js',
        libraryTarget: 'umd',
        libraryExport: 'default',
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
    ],
};
