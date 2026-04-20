const video = document.querySelector('#video');
const canvas = document.querySelector('#overlayCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const sportPreset = document.querySelector('#sportPreset');
const sourceMode = document.querySelector('#sourceMode');
const modeText = document.querySelector('#modeText');

const videoUploadGroup = document.querySelector('#videoUploadGroup');
const cameraGroup = document.querySelector('#cameraGroup');
const videoFileInput = document.querySelector('#videoFileInput');
const timeline = document.querySelector('#timeline');
const playPauseBtn = document.querySelector('#playPauseBtn');
const stepFrameBtn = document.querySelector('#stepFrameBtn');

const cameraSelect = document.querySelector('#cameraSelect');
const startCameraBtn = document.querySelector('#startCameraBtn');
const stopCameraBtn = document.querySelector('#stopCameraBtn');

const trackingState = document.querySelector('#trackingState');
const objectText = document.querySelector('#objectText');
const contactScoreEl = document.querySelector('#contactScore');
const decisionText = document.querySelector('#decisionText');
const fpsText = document.querySelector('#fpsText');

const clearLogBtn = document.querySelector('#clearLogBtn');
const eventLog = document.querySelector('#eventLog');

const controlIds = [
  'x1',
  'y1',
  'x2',
  'y2',
  'lineThickness',
  'motionThreshold',
  'lumaThreshold',
  'bounceTurnThreshold',
  'contactThreshold',
  'cooldownFrames'
];
const controls = Object.fromEntries(controlIds.map((id) => [id, document.querySelector(`#${id}`)]));

const PRESETS = {
  'table-tennis': { x1: 25, y1: 76, x2: 82, y2: 76, lineThickness: 10, motionThreshold: 23, lumaThreshold: 140, bounceTurnThreshold: 7, contactThreshold: 12, cooldownFrames: 10 },
  pickleball: { x1: 19, y1: 78, x2: 84, y2: 78, lineThickness: 14, motionThreshold: 20, lumaThreshold: 125, bounceTurnThreshold: 6, contactThreshold: 13, cooldownFrames: 10 },
  padel: { x1: 22, y1: 80, x2: 86, y2: 80, lineThickness: 15, motionThreshold: 21, lumaThreshold: 122, bounceTurnThreshold: 6, contactThreshold: 15, cooldownFrames: 12 },
  badminton: { x1: 18, y1: 73, x2: 88, y2: 73, lineThickness: 10, motionThreshold: 26, lumaThreshold: 135, bounceTurnThreshold: 9, contactThreshold: 16, cooldownFrames: 13 },
  custom: { x1: 22, y1: 75, x2: 80, y2: 75, lineThickness: 14, motionThreshold: 28, lumaThreshold: 130, bounceTurnThreshold: 8, contactThreshold: 14, cooldownFrames: 12 }
};

const state = {
  source: 'video-file',
  stream: null,
  prevFrame: null,
  frameHistory: [],
  cooldown: 0,
  rafId: null,
  frameCount: 0,
  fpsStart: performance.now(),
  eventCounter: 0,
  lineClicks: []
};

function getNumber(id) {
  return Number(controls[id].value);
}

function cfg() {
  return {
    x1: getNumber('x1') / 100,
    y1: getNumber('y1') / 100,
    x2: getNumber('x2') / 100,
    y2: getNumber('y2') / 100,
    lineThickness: getNumber('lineThickness'),
    motionThreshold: getNumber('motionThreshold'),
    lumaThreshold: getNumber('lumaThreshold'),
    bounceTurnThreshold: getNumber('bounceTurnThreshold'),
    contactThreshold: getNumber('contactThreshold'),
    cooldownFrames: getNumber('cooldownFrames')
  };
}

function applyPreset(key) {
  const preset = PRESETS[key] || PRESETS.custom;
  Object.entries(preset).forEach(([k, v]) => {
    if (controls[k]) controls[k].value = v;
  });
}

function setMode(mode) {
  state.source = mode;
  const isVideoFile = mode === 'video-file';
  videoUploadGroup.classList.toggle('hidden', !isVideoFile);
  cameraGroup.classList.toggle('hidden', isVideoFile);
  modeText.textContent = isVideoFile ? 'Uploaded Video' : 'Live Camera';
  stopCamera();
  video.pause();
  state.prevFrame = null;
  state.frameHistory = [];
  trackingState.textContent = 'Idle';
}

function logEvent(text) {
  const li = document.createElement('li');
  li.textContent = text;
  eventLog.prepend(li);
}

function nowLabel() {
  return new Date().toLocaleTimeString();
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return Math.hypot(px - x1, py - y1);

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function drawLineGuide(config) {
  const x1 = config.x1 * canvas.width;
  const y1 = config.y1 * canvas.height;
  const x2 = config.x2 * canvas.width;
  const y2 = config.y2 * canvas.height;

  ctx.save();
  ctx.lineWidth = config.lineThickness;
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.92)';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.95)';
  ctx.beginPath();
  ctx.arc(x1, y1, 7, 0, Math.PI * 2);
  ctx.arc(x2, y2, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function analyzeFrame(curr, prev, config) {
  const x1 = config.x1 * canvas.width;
  const y1 = config.y1 * canvas.height;
  const x2 = config.x2 * canvas.width;
  const y2 = config.y2 * canvas.height;

  let sumX = 0;
  let sumY = 0;
  let count = 0;
  let nearLineCount = 0;

  const stride = 3;
  for (let i = 0; i < curr.data.length; i += 4 * stride) {
    const idx = i / 4;
    const px = idx % canvas.width;
    const py = Math.floor(idx / canvas.width);

    const dr = Math.abs(curr.data[i] - prev.data[i]);
    const dg = Math.abs(curr.data[i + 1] - prev.data[i + 1]);
    const db = Math.abs(curr.data[i + 2] - prev.data[i + 2]);
    const motion = (dr + dg + db) / 3;
    if (motion < config.motionThreshold) continue;

    const luma = 0.2126 * curr.data[i] + 0.7152 * curr.data[i + 1] + 0.0722 * curr.data[i + 2];
    if (luma < config.lumaThreshold) continue;

    count += 1;
    sumX += px;
    sumY += py;

    if (pointSegmentDistance(px, py, x1, y1, x2, y2) <= config.lineThickness / 2) {
      nearLineCount += 1;
    }
  }

  if (!count) {
    return { found: false, x: null, y: null, nearLineCount: 0, contactScore: 0 };
  }

  const x = sumX / count;
  const y = sumY / count;
  const contactScore = nearLineCount * 0.7 + count * 0.1;

  return { found: true, x, y, nearLineCount, contactScore, pixelCount: count };
}

function detectBounce(trackedY, config) {
  if (state.frameHistory.length < 3) return false;
  const [p2, p1, p0] = state.frameHistory.slice(-3);
  const vyOld = p1.y - p2.y;
  const vyNew = p0.y - p1.y;
  const turnAmount = Math.abs(vyNew - vyOld);

  const changedDirection = vyOld > 0 && vyNew < 0;
  const lowEnough = trackedY > canvas.height * 0.35;

  return changedDirection && turnAmount >= config.bounceTurnThreshold && lowEnough;
}

function decide(analysis, config) {
  if (state.cooldown > 0) {
    state.cooldown -= 1;
    return;
  }

  const bounced = detectBounce(analysis.y, config);
  if (!bounced) return;

  const conf = Math.min(99, Math.round((analysis.contactScore / (config.contactThreshold * 2)) * 100));
  const verdict = analysis.contactScore >= config.contactThreshold ? 'IN (line touched)' : 'OUT (missed line)';

  decisionText.textContent = `${verdict} • ${conf}%`;
  state.eventCounter += 1;
  logEvent(`#${state.eventCounter} ${nowLabel()} | ${verdict} | score=${analysis.contactScore.toFixed(1)} conf=${conf}%`);

  state.cooldown = config.cooldownFrames;
}

function syncFps() {
  state.frameCount += 1;
  const now = performance.now();
  const elapsed = now - state.fpsStart;
  if (elapsed >= 1000) {
    fpsText.textContent = String(Math.round((state.frameCount * 1000) / elapsed));
    state.frameCount = 0;
    state.fpsStart = now;
  }
}

function drawTargetDot(x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(34, 197, 94, 0.95)';
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function processFrame() {
  if (!video.videoWidth || !video.videoHeight) {
    state.rafId = requestAnimationFrame(processFrame);
    return;
  }

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const config = cfg();
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const current = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (state.prevFrame) {
    const analysis = analyzeFrame(current, state.prevFrame, config);

    if (analysis.found) {
      objectText.textContent = `x=${analysis.x.toFixed(0)} y=${analysis.y.toFixed(0)} pixels=${analysis.pixelCount}`;
      trackingState.textContent = 'Tracking target';
      contactScoreEl.textContent = analysis.contactScore.toFixed(1);
      drawTargetDot(analysis.x, analysis.y);

      state.frameHistory.push({ x: analysis.x, y: analysis.y });
      if (state.frameHistory.length > 12) state.frameHistory.shift();

      decide(analysis, config);
    } else {
      trackingState.textContent = 'Searching';
      objectText.textContent = 'No target';
      contactScoreEl.textContent = '0';
    }
  } else {
    trackingState.textContent = 'Warming up';
  }

  drawLineGuide(config);
  state.prevFrame = current;
  syncFps();
  state.rafId = requestAnimationFrame(processFrame);
}

function stopLoop() {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = null;
}

async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  cameraSelect.innerHTML = '';
  devices
    .filter((d) => d.kind === 'videoinput')
    .forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
}

function stopCamera() {
  stopLoop();
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
}

async function startCamera() {
  stopCamera();
  state.prevFrame = null;
  state.frameHistory = [];

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : true,
      audio: false
    });

    video.srcObject = state.stream;
    await video.play();
    trackingState.textContent = 'Live';
    processFrame();
  } catch (error) {
    trackingState.textContent = 'Camera error';
    decisionText.textContent = error.message;
  }
}

function loadVideoFile(file) {
  if (!file) return;

  stopCamera();
  const objectUrl = URL.createObjectURL(file);
  video.srcObject = null;
  video.src = objectUrl;
  video.load();

  video.onloadedmetadata = () => {
    timeline.value = '0';
    state.prevFrame = null;
    state.frameHistory = [];
    trackingState.textContent = 'Video loaded';
    video.play();
    stopLoop();
    processFrame();
  };
}

function updateTimelineFromVideo() {
  if (!video.duration || Number.isNaN(video.duration)) return;
  timeline.value = String(Math.round((video.currentTime / video.duration) * 1000));
}

function seekFromTimeline() {
  if (!video.duration || Number.isNaN(video.duration)) return;
  video.currentTime = (Number(timeline.value) / 1000) * video.duration;
}

function stepOneFrame() {
  const fpsGuess = 30;
  video.pause();
  video.currentTime = Math.min(video.duration || Number.MAX_SAFE_INTEGER, video.currentTime + 1 / fpsGuess);
}

function togglePlayPause() {
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

function updateLineFromClick(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

  state.lineClicks.push({ x, y });
  if (state.lineClicks.length < 2) return;

  const [p1, p2] = state.lineClicks.slice(-2);
  controls.x1.value = String(Math.round((p1.x / canvas.width) * 100));
  controls.y1.value = String(Math.round((p1.y / canvas.height) * 100));
  controls.x2.value = String(Math.round((p2.x / canvas.width) * 100));
  controls.y2.value = String(Math.round((p2.y / canvas.height) * 100));

  state.lineClicks = [];
  if (sportPreset.value !== 'custom') sportPreset.value = 'custom';
}

sportPreset.addEventListener('change', () => applyPreset(sportPreset.value));
sourceMode.addEventListener('change', () => setMode(sourceMode.value));
videoFileInput.addEventListener('change', (event) => loadVideoFile(event.target.files[0]));
playPauseBtn.addEventListener('click', togglePlayPause);
stepFrameBtn.addEventListener('click', stepOneFrame);
timeline.addEventListener('input', seekFromTimeline);
startCameraBtn.addEventListener('click', startCamera);
stopCameraBtn.addEventListener('click', stopCamera);
clearLogBtn.addEventListener('click', () => {
  eventLog.innerHTML = '';
  state.eventCounter = 0;
});
canvas.addEventListener('click', updateLineFromClick);
video.addEventListener('timeupdate', updateTimelineFromVideo);
window.addEventListener('beforeunload', stopCamera);

for (const id of controlIds) {
  controls[id].addEventListener('input', () => {
    if (sportPreset.value !== 'custom') sportPreset.value = 'custom';
  });
}

(async function init() {
  applyPreset('table-tennis');
  setMode('video-file');
  if (!navigator.mediaDevices?.getUserMedia) {
    trackingState.textContent = 'No camera API support';
    return;
  }

  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch {
    // keep going; user may still use uploaded video.
  }

  await listCameras();
})();
