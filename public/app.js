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

const state = {
  stream: null,
  prevFrame: null,
  rafId: null,
  flashCount: 0,
  cooldownLeft: 0,
  frameCount: 0,
  fpsStart: performance.now()
};

function getConfig() {
  return {
    motionThreshold: Number(sensitivity.value),
    minBrightness: Number(brightness.value),
    cooldownFrames: Number(cooldown.value)
  };
}

function logEvent(message) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
  eventLog.prepend(li);
}

function drawMarker(x, y) {
  ctx.save();
  ctx.fillStyle = 'rgba(250, 204, 21, 0.95)';
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
      drawMarker(analysis.x, analysis.y);

      if (state.cooldownLeft > 0) {
        state.cooldownLeft -= 1;
      } else if (analysis.score >= 10) {
        state.flashCount += 1;
        state.cooldownLeft = config.cooldownFrames;
        countText.textContent = String(state.flashCount);
        flashText.textContent = `x=${analysis.x.toFixed(0)}, y=${analysis.y.toFixed(0)} (score ${analysis.score})`;
        logEvent(`Likely firefly flash detected (score ${analysis.score})`);
      }
    } else {
      statusText.textContent = 'Watching for flashes';
    }
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

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : true,
      audio: false
    });

    video.srcObject = state.stream;
    await video.play();
    statusText.textContent = 'Live detection running';
    processFrame();
  } catch (error) {
    statusText.textContent = 'Camera unavailable';
    flashText.textContent = error.message;
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
