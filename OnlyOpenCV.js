const video = document.getElementById('video');
const canvas = document.getElementById('hiddenCanvas'); // Match updated HTML ID
const ctx = canvas.getContext('2d');
const captureButton = document.getElementById('captureButton');
const statusDiv = document.getElementById('status');

let template = null;
let resizedTemplate = null;
let templateSize = 150;
const scale = 0.5;
const minMatchScore = 0.85;

function waitForOpenCV() {
    return new Promise(resolve => {
        const check = () => {
            if (cv && cv.Mat) resolve();
            else setTimeout(check, 100);
        };
        check();
    });
}

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
    });
    video.srcObject = stream;

    return new Promise(resolve => {
        video.onloadedmetadata = () => {
            video.width = canvas.width = video.videoWidth;
            video.height = canvas.height = video.videoHeight;
            resolve();
        };
    });
}

function captureTemplate() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0);
    const centerX = Math.floor(video.videoWidth / 2);
    const centerY = Math.floor(video.videoHeight / 2);
    const startX = centerX - templateSize / 2;
    const startY = centerY - templateSize / 2;
    const imageData = tempCtx.getImageData(startX, startY, templateSize, templateSize);
    template = cv.matFromImageData(imageData);
    cv.cvtColor(template, template, cv.COLOR_RGBA2GRAY);
    resizedTemplate = new cv.Mat();
    cv.resize(template, resizedTemplate, new cv.Size(0, 0), scale, scale, cv.INTER_AREA);
    statusDiv.textContent = "✅ Foot captured!";
}

function sendFootPositionToUnity(x, y) {
    if (typeof unityInstance !== 'undefined' && unityInstance.SendMessage) {
        const json = JSON.stringify({ x: x, y: y });
        unityInstance.SendMessage("FootCube", "OnFootDetected", json);
    }
}

let matchBuffer = null;

function detect() {
    ctx.drawImage(video, 0, 0);
    if (!resizedTemplate) {
        requestAnimationFrame(detect);
        return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const base64 = canvas.toDataURL("image/jpeg");

    if (unityInstance) {
        unityInstance.SendMessage("CameraManager", "OnReceiveVideoFrame", base64);
    }
    const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = cv.matFromImageData(frameData);
    const gray = new cv.Mat();
    const resized = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
    cv.resize(gray, resized, new cv.Size(0, 0), scale, scale, cv.INTER_AREA);

    if (!matchBuffer || matchBuffer.rows !== (resized.rows - resizedTemplate.rows + 1) || matchBuffer.cols !== (resized.cols - resizedTemplate.cols + 1)) {
        if (matchBuffer) matchBuffer.delete();
        matchBuffer = new cv.Mat();
    }

    const result = matchBuffer;
    cv.matchTemplate(resized, resizedTemplate, result, cv.TM_CCOEFF_NORMED);
    const minMax = cv.minMaxLoc(result);
    const pt = minMax.maxLoc;
    const score = minMax.maxVal;

    if (score > minMatchScore) {
        const centerX = (pt.x + resizedTemplate.cols / 2) / scale;
        const centerY = (pt.y + resizedTemplate.rows / 2) / scale;
        statusDiv.textContent = `👣 Foot Detected (Score: ${score.toFixed(2)})`;
        sendFootPositionToUnity(centerX, centerY);
    } else {
        statusDiv.textContent = `🔍 Scanning... (Score: ${score.toFixed(2)})`;
    }

    src.delete(); gray.delete(); resized.delete();
    requestAnimationFrame(detect);
}

async function main() {
    await waitForOpenCV();
    await startCamera();
    captureButton.onclick = captureTemplate;
    statusDiv.textContent = "📷 Align foot and press capture";
    detect();
}

window.addEventListener('load', main);
