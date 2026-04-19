//@ts-check

'use strict';

const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // Map .js imports to .ts sources so Node16-style ESM imports resolve correctly.
    extensionAlias: { '.js': ['.ts', '.js'] }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }]
      }
    ]
  },
  devtool: 'nosources-source-map',
  infrastructureLogging: { level: 'log' }
};

/** @type WebpackConfig */
const webviewConfig = {
  target: 'web',
  mode: 'none',
  entry: {
    chat: './src/ui/webview/chat/chat.ts',
    models: './src/ui/webview/models/models.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'webview'),
    filename: '[name].js'
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }]
      }
    ]
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/ui/webview/chat/chat.html', to: 'chat/chat.html' },
        { from: 'src/ui/webview/chat/chat.css', to: 'chat/chat.css' },
        { from: 'src/ui/webview/models/models.html', to: 'models/models.html' },
        { from: 'src/ui/webview/models/models.css', to: 'models/models.css' }
      ]
    })
  ],
  devtool: 'nosources-source-map',
  infrastructureLogging: { level: 'log' }
};

module.exports = [extensionConfig, webviewConfig];
