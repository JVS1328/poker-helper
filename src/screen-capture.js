// Screen capture singleton: holds the active MediaStream + a hidden <video>
// that mirrors it, so any caller can grab a frame and crop a region without
// re-prompting the user for screen-sharing each time.

let stream = null;
let video = null;
let listeners = new Set();

const ensureVideo = () => {
  if (video) return video;
  video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  return video;
};

const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } });

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const isActive = () => !!stream && stream.getVideoTracks().some(t => t.readyState === 'live');

export const getStream = () => stream;
export const getVideoElement = () => ensureVideo();

export const startCapture = async () => {
  if (isActive()) return stream;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not supported in this browser.');
  }
  const s = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 5 },
    audio: false,
  });
  stream = s;
  const v = ensureVideo();
  v.srcObject = s;
  await v.play().catch(() => { /* autoplay blocks are non-fatal */ });
  s.getVideoTracks().forEach(t => {
    t.addEventListener('ended', () => {
      if (stream === s) {
        stream = null;
        if (video) video.srcObject = null;
        emit();
      }
    });
  });
  emit();
  return s;
};

export const stopCapture = () => {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (video) video.srcObject = null;
  emit();
};

// Returns the natural source dimensions of the captured video (the original
// screen resolution being shared), not the rendered preview size.
export const getSourceSize = () => {
  const v = ensureVideo();
  return { width: v.videoWidth || 0, height: v.videoHeight || 0 };
};

// Region is { x, y, w, h } as fractions (0-1) of the source dimensions.
// Storing fractions instead of raw pixels means resizing the captured window
// rescales the boxes proportionally — calibration survives a window resize.
// Returns a base64-encoded JPEG (without the data: prefix) of just that region.
export const captureRegion = (region, { quality = 0.85, maxDim = 1024 } = {}) => {
  if (!isActive()) throw new Error('Screen capture is not active.');
  const v = ensureVideo();
  if (!v.videoWidth || !v.videoHeight) throw new Error('Capture stream not ready yet.');
  const W = v.videoWidth;
  const H = v.videoHeight;
  const sx = Math.max(0, Math.round(region.x * W));
  const sy = Math.max(0, Math.round(region.y * H));
  const sw = Math.max(1, Math.min(W - sx, Math.round(region.w * W)));
  const sh = Math.max(1, Math.min(H - sy, Math.round(region.h * H)));

  // Downscale large crops so we don't blow API request size on huge screens.
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(v, sx, sy, sw, sh, 0, 0, dw, dh);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const comma = dataUrl.indexOf(',');
  return {
    base64: dataUrl.slice(comma + 1),
    mediaType: 'image/jpeg',
    width: dw,
    height: dh,
  };
};

// Grab the entire current frame at higher resolution than a region crop —
// suit pips and chip totals are small, so we want to keep detail. Anthropic's
// vision pipeline downscales internally to ~1568 px on the long edge, so going
// above that doesn't help.
export const captureFullFrame = (opts = {}) =>
  captureRegion({ x: 0, y: 0, w: 1, h: 1 }, { quality: 0.9, maxDim: 1568, ...opts });
