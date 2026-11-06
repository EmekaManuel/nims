import { Config } from '@remotion/cli/config';
import { override } from './webpack-override.mjs';
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(18);
Config.overrideWebpackConfig(override);
