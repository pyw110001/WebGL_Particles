import { processBlobToAscii } from "./imageProcessing.js";

export const VIDEO_FRAME_RATE = 10;
export const VIDEO_MAX_SECONDS = 30;
export const VIDEO_SCALE_WIDTH = 960;

const API_BASE = "http://127.0.0.1:5174";
const EXTRACT_ENDPOINT = `${API_BASE}/api/extract-frames`;

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function requestExtractFrames(file, onStatus) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("video", file);

    request.open("POST", EXTRACT_ENDPOINT);
    request.responseType = "json";

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onStatus?.({ phase: "loading", label: "Uploading", progress: null });
        return;
      }

      onStatus?.({
        phase: "loading",
        label: "Uploading",
        progress: clampProgress((event.loaded / event.total) * 100),
      });
    };

    request.onload = () => {
      const payload =
        typeof request.response === "string" ? JSON.parse(request.response) : request.response;

      if (request.status >= 200 && request.status < 300) {
        resolve(payload);
        return;
      }

      reject(new Error(payload?.error || `Video extraction failed with status ${request.status}.`));
    };

    request.onerror = () => {
      reject(new Error("Could not reach the local video extraction server."));
    };

    request.onabort = () => {
      reject(new DOMException("Video extraction was aborted.", "AbortError"));
    };

    request.send(formData);
    onStatus?.({ phase: "extracting", label: "Extracting in background", progress: null });
  });
}

export async function extractVideoFrames({ file, onStatus }) {
  const payload = await requestExtractFrames(file, onStatus);

  if (!payload?.frames?.length) {
    throw new Error("No video frames were extracted.");
  }

  onStatus?.({ phase: "extracting", label: "Reading frames", progress: 100 });

  return {
    frames: payload.frames.map((frame) => base64ToBlob(frame.data, frame.mimeType || "image/jpeg")),
    frameRate: payload.frameRate || VIDEO_FRAME_RATE,
    duration: payload.duration || payload.frames.length / (payload.frameRate || VIDEO_FRAME_RATE),
    maxSeconds: payload.maxSeconds || VIDEO_MAX_SECONDS,
  };
}

export async function processVideoFramesToAscii({
  frames,
  width,
  height,
  cellSize,
  characterSet,
  invertMode,
  onStatus,
}) {
  const processedFrames = [];

  for (let index = 0; index < frames.length; index += 1) {
    processedFrames.push(
      await processBlobToAscii({
        blob: frames[index],
        width,
        height,
        cellSize,
        characterSet,
        invertMode,
      }),
    );

    if (index % 3 === 0 || index === frames.length - 1) {
      onStatus?.({
        phase: "processing",
        label: "Processing frames",
        progress: clampProgress(((index + 1) / frames.length) * 100),
      });

      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return processedFrames;
}
