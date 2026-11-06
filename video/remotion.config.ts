import { Config } from '@remotion/cli/config';
import path from 'node:path';
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(18);

// The video renders the game's real React components from ../web/src. Both projects have their own copy of React:
// force one (this project's) so hooks work, and let the game's own dependencies (Radix) resolve from web/node_modules.
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {
    ...c.resolve,
    alias: { ...(c.resolve?.alias ?? {}), react: path.resolve('node_modules/react'), 'react-dom': path.resolve('node_modules/react-dom') },
    modules: [...(c.resolve?.modules ?? ['node_modules']), path.resolve('../web/node_modules')],
  },
}));
