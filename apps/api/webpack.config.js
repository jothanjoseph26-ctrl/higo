const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');
const webpack = require('webpack');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  externalsPresets: { node: true },
  module: {
    rules: [
      {
        test: /\.d\.ts$/,
        type: 'asset/source',
      },
      {
        test: /\.js\.map$/,
        type: 'asset/source',
      },
      {
        test: /\.node$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /^(@mikro-orm\/core|@nestjs\/mongoose|@nestjs\/sequelize|@nestjs\/typeorm|class-transformer\/storage)(?:\/.*)?$/,
    }),
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: false,
      externalDependencies: 'all',
    }),
    {
      apply(compiler) {
        const ExternalModule = require('webpack/lib/ExternalModule');
        compiler.hooks.normalModuleFactory.tap('CustomExternalsPlugin', (nmf) => {
          nmf.hooks.resolve.tapAsync('CustomExternalsPlugin', (resolveData, callback) => {
            const req = resolveData.request;
            if (req && (req === 'sharp' || req.startsWith('sharp/') || /sharp/i.test(req))) {
              const externalModule = new ExternalModule(
                'sharp',
                'commonjs',
                'sharp'
              );
              return callback(null, externalModule);
            }
            callback();
          });
        });
      }
    }
  ],
};
