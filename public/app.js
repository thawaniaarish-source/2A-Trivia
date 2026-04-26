const video = document.querySelector('#video');
const canvas = document.querySelector('#overlayCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

const cameraSelect = document.querySelector('#cameraSelect');
const sensitivity = document.querySelector('#sensitivity');
const brightness = document.querySelector('#brightness');
const cooldown = document.querySelector('#cooldown');

const startCameraBtn = document.querySelector('#startCameraBtn');
const stopCameraBtn = document.querySelector('#stopCameraBtn');

const statusText = document.querySelector('#statusText');
const flashText = document.querySelector('#flashText');
const countText = document.querySelector('#countText');
const fpsText = document.querySelector('#fpsText');
const eventLog = document.querySelector('#eventLog');
const verdictIcon = document.querySelector('#verdictIcon');
const verdictText = document.querySelector('#verdictText');

const state = {
  stream: null,
  prevFrame: null,
  rafId: null,
  flashCount: 0,
  cooldownLeft: 0,
  frameCount: 0,
  fpsStart: performance.now(),
  visibilityHistory: [],
  lastPoint: null
};

function getConfig() {
  return {
    motionThreshold: Number(sensitivity.value),
    minBrightness: Number(brightness.value),
    cooldownFrames: Number(cooldown.value)
  };
}

function setVerdict(isFirefly) {
  if (isFirefly) {
    verdictIcon.textContent = '✓';
    verdictIcon.className = 'verdict-icon good';
    verdictText.textContent = 'Firefly detected';
  } else {
    verdictIcon.textContent = '✕';
    verdictIcon.className = 'verdict-icon bad';
    verdictText.textContent = 'Not a firefly';
  }
}

function setNeutralVerdict() {
  verdictIcon.textContent = '•';
  verdictIcon.className = 'verdict-icon';
  verdictText.textContent = 'Waiting for subject';
}

function logEvent(message) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
  eventLog.prepend(li);
}

function drawMarker(x, y, color = 'rgba(250, 204, 21, 0.95)') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function analyzeFrame(current, previous, config) {
  let sumX = 0;
  let sumY = 0;
  let brightMovingPixels = 0;

  const stride = 4;
  for (let i = 0; i < current.data.length; i += 4 * stride) {
    const idx = i / 4;
    const x = idx % canvas.width;
    const y = Math.floor(idx / canvas.width);

    const dr = Math.abs(current.data[i] - previous.data[i]);
    const dg = Math.abs(current.data[i + 1] - previous.data[i + 1]);
    const db = Math.abs(current.data[i + 2] - previous.data[i + 2]);
    const motion = (dr + dg + db) / 3;

    if (motion < config.motionThreshold) continue;

    const luma = 0.2126 * current.data[i] + 0.7152 * current.data[i + 1] + 0.0722 * current.data[i + 2];
    if (luma < config.minBrightness) continue;

    brightMovingPixels += 1;
    sumX += x;
    sumY += y;
  }

  if (!brightMovingPixels) return { found: false };

  return {
    found: true,
    x: sumX / brightMovingPixels,
    y: sumY / brightMovingPixels,
    score: brightMovingPixels
  };
}

function likelyFirefly(analysis) {
  const smallMovingGlow = analysis.score >= 8 && analysis.score <= 140;

  const previousVisible = state.visibilityHistory[state.visibilityHistory.length - 1] ?? false;
  const blinkLike = analysis.found && !previousVisible;

  let movement = 0;
  if (state.lastPoint) {
    movement = Math.hypot(analysis.x - state.lastPoint.x, analysis.y - state.lastPoint.y);
  }

  const movementLooksNatural = movement <= 220;
  return smallMovingGlow && blinkLike && movementLooksNatural;
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

function processFrame() {
  if (!video.videoWidth || !video.videoHeight) {
    state.rafId = requestAnimationFrame(processFrame);
    return;
  }

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  const config = getConfig();
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const current = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (state.prevFrame) {
    const analysis = analyzeFrame(current, state.prevFrame, config);

    if (analysis.found) {
      statusText.textContent = 'Scanning';
      const isFirefly = likelyFirefly(analysis);
      setVerdict(isFirefly);
      drawMarker(analysis.x, analysis.y, isFirefly ? 'rgba(74, 222, 128, 0.95)' : 'rgba(248, 113, 113, 0.95)');

      if (state.cooldownLeft > 0) {
        state.cooldownLeft -= 1;
      } else {
        flashText.textContent = `x=${analysis.x.toFixed(0)}, y=${analysis.y.toFixed(0)} (score ${analysis.score})`;
        if (isFirefly) {
          state.flashCount += 1;
          countText.textContent = String(state.flashCount);
          logEvent('✓ Firefly detected');
        } else {
          logEvent('✕ Not a firefly');
        }
        state.cooldownLeft = config.cooldownFrames;
      }

      state.lastPoint = { x: analysis.x, y: analysis.y };
    } else {
      statusText.textContent = 'Watching for flashes';
      setNeutralVerdict();
      flashText.textContent = 'None';
      state.lastPoint = null;
    }

    state.visibilityHistory.push(analysis.found);
    if (state.visibilityHistory.length > 10) state.visibilityHistory.shift();
  } else {
    statusText.textContent = 'Warming up camera';
  }

  state.prevFrame = current;
  syncFps();
  state.rafId = requestAnimationFrame(processFrame);
}

function stopLoop() {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = null;
}

function stopCamera() {
  stopLoop();
  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
    state.stream = null;
  }
  statusText.textContent = 'Stopped';
  setNeutralVerdict();
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

async function startCamera() {
  stopCamera();
  state.prevFrame = null;
  state.visibilityHistory = [];
  state.lastPoint = null;

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : true,
      audio: false
    });

    video.srcObject = state.stream;
    await video.play();
    statusText.textContent = 'Live detection running';
    setNeutralVerdict();
    processFrame();
  } catch (error) {
    statusText.textContent = 'Camera unavailable';
    flashText.textContent = error.message;
    setVerdict(false);
  }
}

startCameraBtn.addEventListener('click', startCamera);
stopCameraBtn.addEventListener('click', stopCamera);
window.addEventListener('beforeunload', stopCamera);

(async function init() {
  if (!navigator.mediaDevices?.getUserMedia) {
    statusText.textContent = 'Camera API not supported in this browser';
    return;
  }

  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch {
    // User may enable camera later.
  }

  await listCameras();
})();
