// OnlyOpenCV.js
const video         = document.getElementById('video');
const canvas        = document.getElementById('hiddenCanvas');
const ctx           = canvas.getContext('2d');
const captureButton = document.getElementById('captureButton');
const statusDiv     = document.getElementById('status');

let template       = null;
let resizedTemplate= null;
const templateSize = 150;
const scale        = 0.5;
const minMatchScore= 0.85;
let matchBuffer    = null;

function waitForOpenCV() {
  return new Promise(res => {
    (function check() {
      if (cv && cv.Mat) res();
      else setTimeout(check,100);
    })();
  });
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode: 'environment' } });
  video.srcObject = stream;
  return new Promise(res => {
    video.onloadedmetadata = () => {
      // sync the hidden canvas size
      canvas.width = video.videoWidth;
      canvas.height= video.videoHeight;
      res();
    };
  });
}

function captureTemplate() {
  // grab full frame into temp canvas
  const tmp = document.createElement('canvas');
  tmp.width = video.videoWidth;
  tmp.height= video.videoHeight;
  tmp.getContext('2d').drawImage(video,0,0);

  const cx = video.videoWidth/2, cy = video.videoHeight/2;
  const imgData = tmp.getContext('2d')
    .getImageData(cx - templateSize/2, cy - templateSize/2, templateSize, templateSize);

  template = cv.matFromImageData(imgData);
  cv.cvtColor(template, template, cv.COLOR_RGBA2GRAY);
  resizedTemplate = new cv.Mat();
  cv.resize(template, resizedTemplate, new cv.Size(0,0), scale, scale, cv.INTER_AREA);

  statusDiv.textContent = "✅ Foot captured!";
}

function sendFootPositionToUnity(x,y) {
  if (window.unityInstance && unityInstance.SendMessage) {
    const json = JSON.stringify({ x, y });
    unityInstance.SendMessage("FootCube", "OnFootDetected", json);
  }
}

function sendFrameToUnity() {
  // get JPEG data URL
  const base64 = canvas.toDataURL("image/jpeg");
  if (window.unityInstance && unityInstance.SendMessage) {
    unityInstance.SendMessage("CameraManager", "OnReceiveVideoFrame", base64);
  }
}

function detectLoop() {
  // ensure canvas is sized correctly _before_ drawing!
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;

  // draw current video frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // send frame to Unity every loop
  sendFrameToUnity();

  if (resizedTemplate) {
    // template-match
    const frameMat = cv.matFromImageData(ctx.getImageData(0,0,canvas.width,canvas.height));
    const gray = new cv.Mat(), small = new cv.Mat();
    cv.cvtColor(frameMat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(3,3),0);
    cv.resize(gray, small, new cv.Size(0,0), scale, scale, cv.INTER_AREA);

    if (!matchBuffer ||
        matchBuffer.rows !== small.rows - resizedTemplate.rows + 1 ||
        matchBuffer.cols !== small.cols - resizedTemplate.cols + 1) {
      matchBuffer && matchBuffer.delete();
      matchBuffer = new cv.Mat();
    }

    cv.matchTemplate(small, resizedTemplate, matchBuffer, cv.TM_CCOEFF_NORMED);
    const { maxLoc: pt, maxVal: score } = cv.minMaxLoc(matchBuffer);

    if (score > minMatchScore) {
      const x = (pt.x + resizedTemplate.cols/2)/scale;
      const y = (pt.y + resizedTemplate.rows/2)/scale;
      statusDiv.textContent = `👣 Foot Detected (Score: ${score.toFixed(2)})`;
      sendFootPositionToUnity(x, y);
    } else {
      statusDiv.textContent = `🔍 Scanning… (${score.toFixed(2)})`;
    }

    frameMat.delete(); gray.delete(); small.delete();
  }

  requestAnimationFrame(detectLoop);
}

async function main() {
  await waitForOpenCV();
  await startCamera();
  captureButton.onclick = captureTemplate;
  statusDiv.textContent = "📷 Align foot and press capture";
  detectLoop();
}

window.addEventListener('load', main);
