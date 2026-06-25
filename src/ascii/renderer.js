const BACKGROUND_COLOR = "#050506";
const MONO_COLOR = "rgb(231, 255, 244)";

function getCellColor(cell, colorMode) {
  if (colorMode === "mono") return MONO_COLOR;
  if (colorMode === "luminance") return cell.luminanceColor;
  return cell.color;
}

export class AsciiRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.intensity = null;
  }

  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  render({ processedImage, trail, params, width, height, isImageReady, statusText, globalRevealAlpha = 0 }) {
    this.resize(width, height);

    const ctx = this.context;
    ctx.save();
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, width, height);

    if (!processedImage || !isImageReady) {
      this.drawLoadingState(width, height, statusText);
      ctx.restore();
      return;
    }

    this.drawTrailAscii(processedImage, trail.points, params, globalRevealAlpha);
    ctx.restore();
  }

  drawLoadingState(width, height, statusText = "Sampling image...") {
    const ctx = this.context;
    ctx.fillStyle = "rgba(231, 255, 244, 0.72)";
    ctx.font = '500 13px "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", Consolas, monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(statusText, width * 0.5, height * 0.5);
  }

  drawTrailAscii(processedImage, points, params, globalRevealAlpha = 0) {
    const { cells, columns, rows, cellSize } = processedImage;
    const cellCount = cells.length;
    const revealAlpha = Math.max(0, Math.min(1, globalRevealAlpha));

    if (!this.intensity || this.intensity.length !== cellCount) {
      this.intensity = new Float32Array(cellCount);
    } else {
      this.intensity.fill(0);
    }

    for (const point of points) {
      const radius = Math.max(1, point.radius);
      const radiusSquared = radius * radius;
      const minColumn = Math.max(0, Math.floor((point.x - radius) / cellSize));
      const maxColumn = Math.min(columns - 1, Math.ceil((point.x + radius) / cellSize));
      const minRow = Math.max(0, Math.floor((point.y - radius) / cellSize));
      const maxRow = Math.min(rows - 1, Math.ceil((point.y + radius) / cellSize));

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          const index = row * columns + column;
          const cell = cells[index];
          const dx = cell.x - point.x;
          const dy = cell.y - point.y;
          const distanceSquared = dx * dx + dy * dy;

          if (distanceSquared <= radiusSquared) {
            const distance = Math.sqrt(distanceSquared);
            const edge = 1 - distance / radius;
            const falloff = Math.pow(edge, 0.58);
            const alpha = point.alpha * falloff;

            if (alpha > this.intensity[index]) {
              this.intensity[index] = alpha;
            }
          }
        }
      }
    }

    if (revealAlpha > 0) {
      for (let index = 0; index < cellCount; index += 1) {
        if (revealAlpha > this.intensity[index]) {
          this.intensity[index] = revealAlpha;
        }
      }
    }

    const ctx = this.context;
    const fontSize = Math.max(8, cellSize * 1.12);
    ctx.font = `600 ${fontSize}px "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", Consolas, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(255, 255, 255, 0.18)";
    ctx.shadowBlur = Math.max(0, cellSize * 0.24);

    for (let index = 0; index < cellCount; index += 1) {
      const alpha = this.intensity[index];
      if (alpha <= 0.025) continue;

      const cell = cells[index];
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.fillStyle = getCellColor(cell, params.colorMode);
      ctx.fillText(cell.char, cell.x, cell.y);
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  dispose() {
    this.intensity = null;
  }
}
