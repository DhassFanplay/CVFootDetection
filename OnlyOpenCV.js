let detector = null;
let selectedDeviceId = null;
let unityInstance = null;
let video = null;
let canvas = null;
let ctx = null;
let firstFrameSent = false;

let frameLoopId = null;
let poseLoopId = null;

async function StartPoseTracking() {
    cancelLoops();
    await setupCamera();
    startFrameLoop();

}

// Step 3: Setup camera and video
async function setupCamera() {
    try {
        // Stop previous tracks
        if (video?.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }

        if (!video) {
            video = document.createElement("video");
            video.setAttribute("autoplay", "");
            video.setAttribute("playsinline", "");
            video.style.display = "none";
            document.body.appendChild(video);
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }  },
            audio: false
        });

        video.srcObject = stream;

        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                video.play().then(resolve).catch(resolve);
            };
        });

        if (!canvas) {
            canvas = document.createElement("canvas");
            canvas.style.display = "none";
            document.body.appendChild(canvas);
            ctx = canvas.getContext("2d");
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    } catch (error) {
        console.error("Error setting up camera:", error);
    }
}

// Step 5a: Start frame sending loop
function startFrameLoop() {
    function sendFrame() {
        if (!video || video.readyState < 2) {
            frameLoopId = requestAnimationFrame(sendFrame);
            return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const base64 = canvas.toDataURL("image/jpeg");

        if (unityInstance) {
            unityInstance.SendMessage("CameraManager", "OnReceiveVideoFrame", base64);
            if (!firstFrameSent) {
                unityInstance.SendMessage("CameraManager", "OnCameraReady");
                firstFrameSent = true;
            }
        }

        frameLoopId = requestAnimationFrame(sendFrame);
    }

    sendFrame();
}


// Cancel any running frame or pose loop
function cancelLoops() {
    if (frameLoopId) cancelAnimationFrame(frameLoopId);
    frameLoopId = null;
}

// Unity registration
function RegisterUnityInstance(instance) {
    unityInstance = instance;
    StartPoseTracking();
}

// Expose to global
window.RegisterUnityInstance = RegisterUnityInstance;
window.StartPoseTracking = StartPoseTracking;
