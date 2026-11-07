import { Config } from '@remotion/cli/config';
import { override } from './webpack-override.mjs';
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(22); // 90 MB at 18; 22 looks the same at 1080p and keeps the file well under GitHub's 100 MB limit
Config.overrideWebpackConfig(override);
// The 3D town needs WebGL in the headless browser: use the machine's graphics (ANGLE) rather than a software fallback.
Config.setChromiumOpenGlRenderer('angle');
// One browser tab at a time. With several, the tabs share one GPU and the 3D town glitches: a frame comes out with the wrong camera or
// with no town at all. A single tab is just as fast, because the tabs were slowing each other down (see scripts/check-video.mjs).
Config.setConcurrency(1);
