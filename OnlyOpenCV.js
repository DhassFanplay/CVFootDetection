// OnlyOpenCV.js

let unityInstance       = null;
let video, offscreen, ctx;
let frameLoopId        = null;
let firstFrameSent     = false;

/**
 * Called by Unity loader when it's ready:
 * window.RegisterUnityInstance(unityInstance)
 */
function RegisterUnityInstance(instance) {
  unityInstance = instance;
  initCameraAndLoop();
}
window.RegisterUnityInstance = RegisterUnityInstance;

async function initCameraAndLoop() {
  // Create hidden <video>
  video = document.createElement("video");
  video.autoplay = true;
  video.muted    = true;
  video.playsInline = true;
  video.style.display = "none";
  document.body.appendChild(video);

  // Create offscreen canvas
  offscreen = document.createElement("canvas");
  ctx       = offscreen.getContext("2d");

  // Start back‐facing camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: "environment" } },
      audio: false
    });
    video.srcObject = stream;
    await new Promise(r => video.onloadedmetadata = r);
  } catch (err) {
    console.error("Could not open back camera, trying any camera...", err);
    // fallback to default camera
    const stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    video.srcObject = stream;
    await new Promise(r => video.onloadedmetadata = r);
  }

  // Size offscreen to match video
  offscreen.width  = video.videoWidth;
  offscreen.height = video.videoHeight;

  // Start sending frames
  requestAnimationFrame(frameLoop);
}

function frameLoop() {
  if (video.readyState >= 2) {
    // draw current frame
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

    // encode as JPEG
    const base64 = offscreen.toDataURL("image/jpeg", 0.8);

    // send to Unity
    if (unityInstance && unityInstance.SendMessage) {
      try {
        unityInstance.SendMessage(
          "CameraManager",
          "OnReceiveVideoFrame",
          base64
        );
        if (!firstFrameSent) {
          unityInstance.SendMessage("CameraManager", "OnCameraReady");
          firstFrameSent = true;
        }
      } catch (e) {
        // Unity might not yet have the method—ignore until it's ready
      }
    }
  }
  frameLoopId = requestAnimationFrame(frameLoop);
}
