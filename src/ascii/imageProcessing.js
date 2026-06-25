const FALLBACK_CHARACTER_SET = "@#S%?*+;:,.";

function createSamplingCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    if (/^https?:\/\//i.test(src)) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

function drawImageCover(context, source, sourceWidth, sourceHeight, width, height) {
  const naturalWidth = sourceWidth;
  const naturalHeight = sourceHeight;
  const sourceRatio = naturalWidth / naturalHeight;
  const targetRatio = width / height;

  let sx = 0;
  let sy = 0;
  let sw = naturalWidth;
  let sh = naturalHeight;

  if (sourceRatio > targetRatio) {
    sw = naturalHeight * targetRatio;
    sx = (naturalWidth - sw) / 2;
  } else {
    sh = naturalWidth / targetRatio;
    sy = (naturalHeight - sh) / 2;
  }

  context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
}

function getSourceDimensions(source) {
  const width = source.naturalWidth || source.videoWidth || source.width;
  const height = source.naturalHeight || source.videoHeight || source.height;

  if (!width || !height) {
    throw new Error("Source has no readable dimensions.");
  }

  return { width, height };
}

function brightnessToCharacter(luminance, characterSet, invertMode) {
  const lastIndex = characterSet.length - 1;
  const normalized = invertMode ? luminance : 1 - luminance;
  const index = Math.max(0, Math.min(lastIndex, Math.round(normalized * lastIndex)));
  return characterSet[index];
}

function boostSourceColor(red, green, blue) {
  const floor = 22;
  const lift = 1.12;

  return {
    red: Math.min(255, Math.round(red * lift + floor)),
    green: Math.min(255, Math.round(green * lift + floor)),
    blue: Math.min(255, Math.round(blue * lift + floor)),
  };
}

export function processSourceToAscii({
  source,
  width,
  height,
  cellSize,
  characterSet = FALLBACK_CHARACTER_SET,
  invertMode = false,
}) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const safeCellSize = Math.max(4, Math.round(cellSize));
  const safeCharacterSet = characterSet?.trim() || FALLBACK_CHARACTER_SET;
  const columns = Math.ceil(safeWidth / safeCellSize);
  const rows = Math.ceil(safeHeight / safeCellSize);
  const sampleCanvas = createSamplingCanvas(columns, rows);
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const sourceDimensions = getSourceDimensions(source);

  sampleContext.clearRect(0, 0, columns, rows);
  sampleContext.imageSmoothingEnabled = true;
  sampleContext.imageSmoothingQuality = "high";
  drawImageCover(sampleContext, source, sourceDimensions.width, sourceDimensions.height, columns, rows);

  const { data } = sampleContext.getImageData(0, 0, columns, rows);
  const cells = new Array(columns * rows);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const pixelIndex = index * 4;
      const red = data[pixelIndex];
      const green = data[pixelIndex + 1];
      const blue = data[pixelIndex + 2];
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      const boosted = boostSourceColor(red, green, blue);

      cells[index] = {
        column,
        row,
        x: column * safeCellSize + safeCellSize * 0.5,
        y: row * safeCellSize + safeCellSize * 0.5,
        char: brightnessToCharacter(luminance, safeCharacterSet, invertMode),
        color: `rgb(${boosted.red}, ${boosted.green}, ${boosted.blue})`,
        luminanceColor: `rgb(${Math.round(luminance * 255)}, ${Math.round(luminance * 255)}, ${Math.round(luminance * 255)})`,
      };
    }
  }

  return {
    width: safeWidth,
    height: safeHeight,
    cellSize: safeCellSize,
    columns,
    rows,
    cells,
  };
}

export async function processImageToAscii(options) {
  const image = await loadImage(options.src);
  return processSourceToAscii({
    ...options,
    source: image,
  });
}

export async function processBlobToAscii({ blob, ...options }) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);

    try {
      return processSourceToAscii({
        ...options,
        source: bitmap,
      });
    } finally {
      bitmap.close?.();
    }
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    return processImageToAscii({
      ...options,
      src: objectUrl,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
