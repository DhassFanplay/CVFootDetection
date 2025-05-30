// OnlyOpenCV.js

const video         = document.getElementById('video');
const captureButton = document.getElementById('captureButton');
const statusDiv     = document.getElementById('status');

// offscreen canvas for OpenCV processing
const offscreen = document.createElement('canvas');
const ctx       = offscreen.getContext('2d');

let template        = null;
let resizedTemplate = null;
const templateSize  = 150;
const scale         = 0.5;
const minScore      = 0.85;
let matchBuffer     = null;

// throttle video‐to‐Unity to ~15fps
let lastVideoSend = 0;
const videoInterval = 66; // ms (~15fps)

function waitForOpenCV() {
  return new Promise(res => {
    (function check() {
      if (cv && cv.Mat) res();
      else setTimeout(check, 100);
    })();
  });
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }
  });
  video.srcObject = stream;
  return new Promise(res => {
    video.onloadedmetadata = () => {
      offscreen.width  = video.videoWidth;
      offscreen.height = video.videoHeight;
      res();
    };
  });
}

function captureTemplate() {
  ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
  const cx = offscreen.width/2, cy = offscreen.height/2;
  const img = ctx.getImageData(
    cx - templateSize/2,
    cy - templateSize/2,
    templateSize, templateSize
  );
  template = cv.matFromImageData(img);
  cv.cvtColor(template, template, cv.COLOR_RGBA2GRAY);
  resizedTemplate = new cv.Mat();
  cv.resize(template, resizedTemplate,
            new cv.Size(0,0), scale, scale,
            cv.INTER_AREA);
  statusDiv.textContent = "✅ Template Captured";
}

function sendToUnity(method, payload) {
  if (!window.unityInstance?.SendMessage) return;
  try {
    unityInstance.SendMessage(...method, payload);
  } catch (e) {
    console.warn("Unity SendMessage failed:", method, e);
  }
}

function detectLoop(timestamp) {
  // draw current frame for processing
  ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

  // send video frame to Unity at most 15fps
  if (timestamp - lastVideoSend > videoInterval) {
    const base64 = offscreen.toDataURL("image/jpeg", 0.6);
    sendToUnity(
      ["CameraManager", "OnReceiveVideoFrame"], 
      base64
    );
    lastVideoSend = timestamp;
  }

  // template‐match if we have one
  if (resizedTemplate) {
    const frameMat = cv.matFromImageData(
      ctx.getImageData(0, 0, offscreen.width, offscreen.height)
    );
    const gray  = new cv.Mat(),
          small = new cv.Mat();
    cv.cvtColor(frameMat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(3,3), 0);
    cv.resize(gray, small,
              new cv.Size(0,0), scale, scale,
              cv.INTER_AREA);

    if (!matchBuffer ||
        matchBuffer.rows !== small.rows - resizedTemplate.rows + 1 ||
        matchBuffer.cols !== small.cols - resizedTemplate.cols + 1) {
      matchBuffer?.delete();
      matchBuffer = new cv.Mat();
    }

    cv.matchTemplate(small, resizedTemplate,
                     matchBuffer, cv.TM_CCOEFF_NORMED);
    const { maxLoc:pt, maxVal:score } = cv.minMaxLoc(matchBuffer);

    if (score > minScore) {
      const x = (pt.x + resizedTemplate.cols/2)/scale;
      const y = (pt.y + resizedTemplate.rows/2)/scale;
      statusDiv.textContent = `👣 Detected (${score.toFixed(2)})`;
      sendToUnity(
        ["FootCube", "OnFootDetected"],
        JSON.stringify({ x, y })
      );
    } else {
      statusDiv.textContent = `🔍 Scanning (${score.toFixed(2)})`;
    }

    frameMat.delete(); gray.delete(); small.delete();
  }

  requestAnimationFrame(detectLoop);
}

async function main() {
  await waitForOpenCV();
  await startCamera();
  captureButton.onclick = captureTemplate;
  statusDiv.textContent = "📷 Align and Capture";
  requestAnimationFrame(detectLoop);
}

window.addEventListener('load', main);
