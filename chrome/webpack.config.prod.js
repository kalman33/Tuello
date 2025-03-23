const { join } = require('path');
const { optimize } = require('webpack');

// Webpack Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: {
    background: join(__dirname, 'src/background.ts'),
    backgroundWrapper: join(__dirname, 'src/backgroundWrapper.ts'),
    contentscript: join(__dirname, 'src/contentscript.ts'),
    httpmanager: join(__dirname, 'src/httpmanager.ts'),
    popup: join(__dirname, 'src/popup/popup.ts'),
    exportTuelloTemplate: join(__dirname, 'assets/export/exportTuelloTemplate.ts')
  },
  output: {
    path: join(__dirname, '../dist/tuello/')
  },
  module: {
    rules: [
      {
        exclude: /node_modules/,
        test: /\.ts?$/,
        loader: 'ts-loader'
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: './chrome/src/popup/popup.html', to: '.' },
        { from: './chrome/src/popup/popup.css', to: '.' },
        { from: './chrome/assets/comment.css', to: '.' },
        { from: './chrome/assets/default.css', to: '.' },
        { from: './chrome/assets/tags.css', to: '.' },
        { from: './node_modules/simptip/simptip.min.css', to: '.' },
        {
          from: './chrome/manifest.json',
          to: '.'
        },
        {
          from: './chrome/assets/logos/*',
          to: './assets/logos/[name][ext]'
        }
      ]
    }),
    new optimize.AggressiveMergingPlugin()
  ],
  resolve: {
    extensions: ['.ts', '.js']
  }
};
