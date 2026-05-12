// ==UserScript==
// @name         Pokernow Helper Bridge
// @namespace    https://github.com/JVS1328/poker-helper
// @version      0.1.0
// @description  Live equity, pot odds, and per-seat HUD shells on pokernow.com tables
// @match        https://www.pokernow.com/games/*
// @match        https://pokernow.com/games/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/JVS1328/poker-helper/main/tampermonkey/pokernow-bridge.user.js
// @downloadURL  https://raw.githubusercontent.com/JVS1328/poker-helper/main/tampermonkey/pokernow-bridge.user.js
// ==/UserScript==

/* eslint-disable no-undef */

(function () {
  'use strict';

  const BUNDLE_URL = 'https://JVS1328.github.io/poker-helper/pokernow-bridge/bundle.js';

  // Expose GM_* storage to the bundle. The bundle reads window.__pokernowBridgeStorage.
  // unsafeWindow lets us put a property visible to the page's main world.
  const target = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  target.__pokernowBridgeStorage = {
    get(key) {
      try { return GM_getValue(key); } catch (e) { return undefined; }
    },
    set(key, value) {
      try { GM_setValue(key, value); } catch (e) { /* ignore */ }
    },
    delete(key) {
      try { GM_deleteValue(key); } catch (e) { /* ignore */ }
    },
    // Cross-tab change subscription. Fires when ANY tab calls GM_setValue
    // for the matching key. Returns an unsubscribe function.
    subscribe(key, fn) {
      try {
        const id = GM_addValueChangeListener(key, (k, oldValue, newValue, remote) => {
          fn(k, oldValue, newValue, !!remote);
        });
        return () => { try { GM_removeValueChangeListener(id); } catch (e) {} };
      } catch (e) {
        return () => {};
      }
    },
  };

  // Optional CORS-free fetch (Phase 2 will use it to poll /games/<id>/log).
  target.__pokernowBridgeFetch = (url, opts = {}) => new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: opts.method || 'GET',
      url,
      headers: opts.headers || {},
      data: opts.body,
      onload: (res) => resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, text: () => res.responseText, json: () => JSON.parse(res.responseText) }),
      onerror: reject,
      ontimeout: reject,
    });
  });

  // Load the main bundle.
  const s = document.createElement('script');
  // Cache-bust each page load during development. Switch to ?v=<version> for release.
  s.src = `${BUNDLE_URL}?t=${Date.now()}`;
  s.async = true;
  s.onerror = () => console.error('[Pokernow Bridge] failed to load bundle from', BUNDLE_URL);
  s.onload = () => console.info('[Pokernow Bridge] bundle loaded');
  (document.head || document.documentElement).appendChild(s);
})();
