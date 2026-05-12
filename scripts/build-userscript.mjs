// Builds a self-contained Tampermonkey userscript: the entire bundle is
// inlined under the userscript header. Use this for local testing — install
// the resulting `.user.js` directly from disk in Tampermonkey, no GitHub
// Pages deployment needed.
//
// Usage:
//   node scripts/build-userscript.mjs            # one-shot build
//   node scripts/build-userscript.mjs --watch    # rebuild on every change

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'src/pokernow-bridge/index.jsx');
const OUT = path.join(ROOT, 'build/pokernow-bridge/pokernow-bridge.user.js');

const HEADER = `// ==UserScript==
// @name         Pokernow Helper Bridge (local build)
// @namespace    https://github.com/JVS1328/poker-helper
// @version      0.1.0-local
// @description  Live equity, HUD stats, per-seat shells, range-aware mode for pokernow.com — fully self-contained build
// @match        https://www.pokernow.com/games/*
// @match        https://pokernow.com/games/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

/* Storage host shim — bridges the bundle's storage API to Tampermonkey GM_* calls. */
(function () {
  'use strict';
  const target = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  target.__pokernowBridgeStorage = {
    get: (key) => { try { return GM_getValue(key); } catch (e) { return undefined; } },
    set: (key, value) => { try { GM_setValue(key, value); } catch (e) {} },
    delete: (key) => { try { GM_deleteValue(key); } catch (e) {} },
    subscribe: (key, fn) => {
      try {
        const id = GM_addValueChangeListener(key, (k, oldV, newV, remote) => fn(k, oldV, newV, !!remote));
        return () => { try { GM_removeValueChangeListener(id); } catch (e) {} };
      } catch (e) { return () => {}; }
    },
  };
  target.__pokernowBridgeFetch = (url, opts = {}) => new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: opts.method || 'GET',
      url, headers: opts.headers || {}, data: opts.body,
      onload: (res) => resolve({
        ok: res.status >= 200 && res.status < 300, status: res.status,
        text: () => res.responseText, json: () => JSON.parse(res.responseText),
      }),
      onerror: reject, ontimeout: reject,
    });
  });
})();

`;

const BUILD_OPTIONS = {
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  // Keep readable for local debugging; uncomment minify for size testing.
  minify: false,
  sourcemap: 'inline',
  outfile: OUT,
  banner: { js: HEADER },
  logLevel: 'info',
};

const watch = process.argv.includes('--watch');

if (watch) {
  const ctx = await esbuild.context(BUILD_OPTIONS);
  await ctx.watch();
  console.log(`Watching for changes — rebuilding ${path.relative(ROOT, OUT)} on save`);
  console.log(`Re-install the .user.js in Tampermonkey after each rebuild (or use @require file:// for hot reload).`);
} else {
  await esbuild.build(BUILD_OPTIONS);
  console.log(`Built ${path.relative(ROOT, OUT)}`);
}
