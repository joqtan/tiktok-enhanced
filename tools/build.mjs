import { build } from 'esbuild';

await build({
  entryPoints: ['src/userscript/index.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  legalComments: 'inline',
  banner: {
    js: `// ==UserScript==
// @name         TikTok Enhanced Autolike
// @namespace    tiktok-enhanced
// @version      0.1.0
// @description  Automatically like TikTok live streams.
// @match        https://www.tiktok.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==`,
  },
  outfile: 'dist/tiktok-enhanced.user.js',
});
