import express from "express";
import multer from "multer";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.ASCII_VIDEO_API_PORT || 5174);
const FRAME_RATE = 10;
const MAX_SECONDS = 30;
const SCALE_WIDTH = 960;
const MAX_UPLOAD_MB = 256;
const WORKSPACE_PREFIX = "foto-ascii-";
const GIF_EXTENSION_PATTERN = /\.gif$/i;

const app = express();
const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
  },
});

app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    ffmpeg: "cli",
    frameRate: FRAME_RATE,
    maxSeconds: MAX_SECONDS,
    scaleWidth: SCALE_WIDTH,
  });
});

app.post("/api/extract-frames", upload.single("video"), async (request, response) => {
  const uploadPath = request.file?.path;
  let workDir;

  try {
    if (!request.file) {
      response.status(400).json({ error: "Missing video file." });
      return;
    }

    if (!isExtractableMedia(request.file)) {
      response.status(400).json({ error: "Uploaded file must be a video or GIF." });
      return;
    }

    workDir = await fs.mkdtemp(path.join(os.tmpdir(), WORKSPACE_PREFIX));
    const framePattern = path.join(workDir, "frame_%04d.jpg");

    await runFFmpeg([
      "-hide_banner",
      "-y",
      "-i",
      uploadPath,
      "-t",
      String(MAX_SECONDS),
      "-vf",
      `fps=${FRAME_RATE},scale=${SCALE_WIDTH}:-2:flags=lanczos`,
      "-q:v",
      "5",
      framePattern,
    ]);

    const frameNames = (await fs.readdir(workDir))
      .filter((name) => /\.jpe?g$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (frameNames.length === 0) {
      response.status(422).json({ error: "No frames were extracted from this video." });
      return;
    }

    const frames = await Promise.all(
      frameNames.map(async (name) => {
        const buffer = await fs.readFile(path.join(workDir, name));
        return {
          name,
          mimeType: "image/jpeg",
          data: buffer.toString("base64"),
        };
      }),
    );

    response.json({
      id: randomUUID(),
      frameRate: FRAME_RATE,
      maxSeconds: MAX_SECONDS,
      duration: frames.length / FRAME_RATE,
      scaleWidth: SCALE_WIDTH,
      frames,
    });
  } catch (error) {
    response.status(500).json({
      error: error.message || "Video extraction failed.",
    });
  } finally {
    await removePath(uploadPath);
    await removePath(workDir);
  }
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    response.status(413).json({ error: `Video must be ${MAX_UPLOAD_MB}MB or smaller.` });
    return;
  }

  response.status(500).json({ error: error.message || "Unexpected server error." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`ASCII video extraction API listening at http://127.0.0.1:${PORT}`);
});

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      windowsHide: true,
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`Could not start ffmpeg: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

function isExtractableMedia(file) {
  return file.mimetype.startsWith("video/") || file.mimetype === "image/gif" || GIF_EXTENSION_PATTERN.test(file.originalname);
}

async function removePath(targetPath) {
  if (!targetPath) return;
  await fs.rm(targetPath, { recursive: true, force: true });
}
