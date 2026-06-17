// Import OGL and Three.js from CDN
import { Renderer, Transform, Vec3, Color, Polyline } from 'https://esm.sh/ogl@0.0.90';
import * as THREE from 'https://esm.sh/three@0.152.0';

// Color Preset Configurations
const PRESETS = {
  falcon: ['#5227FF', '#f74872', '#ce6af2'],
  starlink: ['#00F2FE', '#4FACFE', '#0000FF'],
  dragon: ['#FF0844', '#FFB199', '#E30022'],
  superheavy: ['#FAD961', '#F76B1C', '#FFD700']
};

// Shader Codes
const VERTEX_SHADER = `
  precision highp float;
  
  attribute vec3 position;
  attribute vec3 next;
  attribute vec3 prev;
  attribute vec2 uv;
  attribute float side;
  
  uniform vec2 uResolution;
  uniform float uDPR;
  uniform float uThickness;
  uniform float uTime;
  uniform float uEnableShaderEffect;
  uniform float uEffectAmplitude;
  
  varying vec2 vUV;
  
  vec4 getPosition() {
      vec4 current = vec4(position, 1.0);
      vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
      vec2 nextScreen = next.xy * aspect;
      vec2 prevScreen = prev.xy * aspect;
      vec2 tangent = normalize(nextScreen - prevScreen);
      vec2 normal = vec2(-tangent.y, tangent.x);
      normal /= aspect;
      normal *= mix(1.0, 0.1, pow(abs(uv.y - 0.5) * 2.0, 2.0));
      float dist = length(nextScreen - prevScreen);
      normal *= smoothstep(0.0, 0.02, dist);
      float pixelWidthRatio = 1.0 / (uResolution.y / uDPR);
      float pixelWidth = current.w * pixelWidthRatio;
      normal *= pixelWidth * uThickness;
      current.xy -= normal * side;
      if(uEnableShaderEffect > 0.5) {
        current.xy += normal * sin(uTime + current.x * 10.0) * uEffectAmplitude;
      }
      return current;
  }
  
  void main() {
      vUV = uv;
      gl_Position = getPosition();
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uEnableFade;
  varying vec2 vUV;
  void main() {
      float fadeFactor = 1.0;
      if(uEnableFade > 0.5) {
          fadeFactor = 1.0 - smoothstep(0.0, 1.0, vUV.y);
      }
      gl_FragColor = vec4(uColor, uOpacity * fadeFactor);
  }
`;

// Color Interpolation Utilities
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function interpolateColor(color1, color2, factor) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return color1;
  const r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r));
  const g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g));
  const b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));
  return rgbToHex(r, g, b);
}

function getColorsForCount(presetName, count) {
  const presetColors = PRESETS[presetName] || PRESETS.falcon;
  if (count === 1) return [presetColors[0]];
  if (count === presetColors.length) return [...presetColors];
  
  const colors = [];
  for (let i = 0; i < count; i++) {
    const fraction = i / (count - 1);
    const scaledFraction = fraction * (presetColors.length - 1);
    const index = Math.floor(scaledFraction);
    const nextIndex = Math.min(index + 1, presetColors.length - 1);
    const localFactor = scaledFraction - index;
    colors.push(interpolateColor(presetColors[index], presetColors[nextIndex], localFactor));
  }
  return colors;
}

class SpaceBackground {
  constructor() {
    this.canvas = document.getElementById('three-bg');
    if (!this.canvas) return;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio || 2);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.z = 5;

    this.initStars();
    this.setupEvents();
    this.animate();
  }

  initStars() {
    const starCount = 2000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const baseColor = new THREE.Color('#f0f0fa');

    for (let i = 0; i < starCount; i++) {
      // Create a nice distribution of stars in 3D space
      const x = (Math.random() - 0.5) * 16;
      const y = (Math.random() - 0.5) * 16;
      const z = (Math.random() - 0.5) * 12 - 2;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Add slight variety to star colors (mostly bluish-white)
      const colorJitter = Math.random() * 0.25;
      colors[i * 3] = baseColor.r - colorJitter * 0.1;
      colors[i * 3 + 1] = baseColor.g - colorJitter * 0.05;
      colors[i * 3 + 2] = baseColor.b + colorJitter * 0.15;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Custom Canvas Circular Particle Texture for softer glows
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.3, 'rgba(240, 240, 250, 0.8)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 16);
    const texture = new THREE.CanvasTexture(canvas);

    this.material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(geometry, this.material);
    this.scene.add(this.points);
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });

    // Capture mouse movement for slight parallax effect
    this.mouseTarget = { x: 0, y: 0 };
    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.mouseTarget.x = x * 0.35;
      this.mouseTarget.y = y * 0.35;
    });
    window.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length) {
        const x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        const y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
        this.mouseTarget.x = x * 0.35;
        this.mouseTarget.y = y * 0.35;
      }
    }, { passive: true });
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Rotate stars slowly
    if (this.points) {
      this.points.rotation.y += 0.0002;
      this.points.rotation.x += 0.0001;
    }

    // Camera parallax easing
    this.camera.position.x += (this.mouseTarget.x - this.camera.position.x) * 0.05;
    this.camera.position.y += (this.mouseTarget.y - this.camera.position.y) * 0.05;
    this.camera.lookAt(0, 0, -2);

    this.renderer.render(this.scene, this.camera);
  }
}

class TelemetrySystem {
  constructor() {
    this.startTime = Date.now();
    this.setupMET();
    this.setupTelemetryFluctuation();
  }

  setupMET() {
    const metElement = document.getElementById('mission-elapsed-time');
    const update = () => {
      const elapsed = Date.now() - this.startTime;
      const ms = Math.floor((elapsed % 1000) / 10).toString().padStart(2, '0');
      const secs = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
      const mins = Math.floor((elapsed / 60000) % 60).toString().padStart(2, '0');
      const hours = Math.floor((elapsed / 3600000) % 24).toString().padStart(2, '0');
      const days = Math.floor(elapsed / 86400000).toString().padStart(2, '0');
      
      if (metElement) {
        metElement.innerText = `${days}:${hours}:${mins}:${secs}`;
      }
    };
    setInterval(update, 33);
  }

  setupTelemetryFluctuation() {
    this.altitudeVal = 142.34;
    this.velocityVal = 7.82;
    this.accelVal = 1.03;

    const altElement = document.getElementById('tel-altitude');
    const velElement = document.getElementById('tel-velocity');
    const accElement = document.getElementById('tel-accel');

    const updateFluctuation = () => {
      // Simulate minor sensor fluctuations
      this.altitudeVal = (142.34 + (Math.random() - 0.5) * 0.12).toFixed(2);
      this.velocityVal = (7.82 + (Math.random() - 0.5) * 0.03).toFixed(2);
      this.accelVal = (1.03 + (Math.random() - 0.5) * 0.04).toFixed(2);

      if (altElement) altElement.innerText = `${this.altitudeVal} km`;
      if (velElement) velElement.innerText = `${this.velocityVal} km/s`;
      if (accElement) accElement.innerText = `${this.accelVal} G`;
    };
    setInterval(updateFluctuation, 400);
  }
}

class RibbonApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    if (!this.container) return;

    // Parameters (Synced with UI controls)
    this.preset = 'falcon';
    this.ribbonCount = 3;
    this.baseSpring = 0.03;
    this.baseFriction = 0.9;
    this.baseThickness = 30;
    this.offsetFactor = 0.05;
    this.maxAge = 500;
    this.pointCount = 50;
    this.speedMultiplier = 0.5;
    this.enableFade = true;
    this.enableWaves = true;
    this.effectAmplitude = 2.0;

    // State Variables
    this.lines = [];
    this.mouse = new Vec3(0, 0, 0);
    this.prevMouse = new Vec3(0, 0, 0);
    this.currentSpeed = 0;
    this.mouseMoved = false;
    this.fpsFrameCount = 0;
    this.lastFpsTime = performance.now();

    // Initialize WebGL Renderer
    this.renderer = new Renderer({
      dpr: window.devicePixelRatio || 2,
      alpha: true,
      preserveDrawingBuffer: true
    });
    this.gl = this.renderer.gl;
    this.gl.clearColor(0, 0, 0, 0);

    // Append canvas to container
    this.gl.canvas.style.position = 'absolute';
    this.gl.canvas.style.top = '0';
    this.gl.canvas.style.left = '0';
    this.gl.canvas.style.width = '100%';
    this.gl.canvas.style.height = '100%';
    this.container.appendChild(this.gl.canvas);

    // Initialize Scene
    this.scene = new Transform();

    // Build lines
    this.buildLines();

    // Setup events
    this.setupEventListeners();

    // Start render loop
    this.lastTime = performance.now();
    this.animate();
  }

  buildLines() {
    // 1. Remove all old lines from scene
    this.lines.forEach(line => {
      if (line.polyline && line.polyline.mesh) {
        line.polyline.mesh.setParent(null);
      }
    });
    this.lines = [];

    // Get color array based on count
    const colors = getColorsForCount(this.preset, this.ribbonCount);
    const center = (colors.length - 1) / 2;

    colors.forEach((color, index) => {
      // Add slight randomness to physics to give natural flow separation
      const spring = this.baseSpring + (Math.random() - 0.5) * 0.01;
      const friction = this.baseFriction + (Math.random() - 0.5) * 0.05;
      const thickness = this.baseThickness + (Math.random() - 0.5) * 3;
      const mouseOffset = new Vec3(
        (index - center) * this.offsetFactor + (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.1,
        0
      );

      const line = {
        spring,
        friction,
        mouseVelocity: new Vec3(),
        mouseOffset,
        points: []
      };

      for (let i = 0; i < this.pointCount; i++) {
        line.points.push(new Vec3());
      }

      line.polyline = new Polyline(this.gl, {
        points: line.points,
        vertex: VERTEX_SHADER,
        fragment: FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: new Color(color) },
          uThickness: { value: thickness },
          uOpacity: { value: 1.0 },
          uTime: { value: 0.0 },
          uEnableShaderEffect: { value: this.enableWaves ? 1.0 : 0.0 },
          uEffectAmplitude: { value: this.effectAmplitude },
          uEnableFade: { value: this.enableFade ? 1.0 : 0.0 }
        }
      });

      line.polyline.mesh.setParent(this.scene);
      this.lines.push(line);
    });

    this.resize();

    // Update Telemetry Panel
    const activeTrailsEl = document.getElementById('tel-active-trails');
    if (activeTrailsEl) activeTrailsEl.innerText = this.lines.length;
  }

  resize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.lines.forEach(line => {
      if (line.polyline) line.polyline.resize();
    });
  }

  setupEventListeners() {
    // Window resize
    window.addEventListener('resize', () => this.resize());

    // Mouse & Touch interaction
    const updateMouse = (e) => {
      this.mouseMoved = true;
      let clientX, clientY;
      const rect = this.container.getBoundingClientRect();
      
      if (e.touches && e.touches.length) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;

      this.mouse.set(
        (x / width) * 2 - 1,
        (y / height) * -2 + 1,
        0
      );
    };

    this.container.addEventListener('mousemove', updateMouse);
    this.container.addEventListener('touchmove', updateMouse, { passive: true });
    this.container.addEventListener('touchstart', updateMouse, { passive: true });

    // Slider Controls
    const countInput = document.getElementById('input-count');
    const thicknessInput = document.getElementById('input-thickness');
    const speedInput = document.getElementById('input-speed');
    const maxAgeInput = document.getElementById('input-max-age');
    const fadeInput = document.getElementById('input-fade');
    const wavesInput = document.getElementById('input-waves');

    // Display elements
    const countVal = document.getElementById('val-count');
    const thicknessVal = document.getElementById('val-thickness');
    const speedVal = document.getElementById('val-speed');
    const maxAgeVal = document.getElementById('val-max-age');

    if (countInput) {
      countInput.addEventListener('input', (e) => {
        this.ribbonCount = parseInt(e.target.value);
        if (countVal) countVal.innerText = this.ribbonCount;
        this.buildLines();
      });
    }

    if (thicknessInput) {
      thicknessInput.addEventListener('input', (e) => {
        this.baseThickness = parseFloat(e.target.value);
        if (thicknessVal) thicknessVal.innerText = this.baseThickness;
        this.lines.forEach(line => {
          if (line.polyline) {
            line.polyline.mesh.program.uniforms.uThickness.value = this.baseThickness + (Math.random() - 0.5) * 3;
          }
        });
      });
    }

    if (speedInput) {
      speedInput.addEventListener('input', (e) => {
        this.speedMultiplier = parseFloat(e.target.value);
        if (speedVal) speedVal.innerText = this.speedMultiplier.toFixed(1);
      });
    }

    if (maxAgeInput) {
      maxAgeInput.addEventListener('input', (e) => {
        this.maxAge = parseInt(e.target.value);
        if (maxAgeVal) maxAgeVal.innerText = this.maxAge;
      });
    }

    if (fadeInput) {
      fadeInput.addEventListener('change', (e) => {
        this.enableFade = e.target.checked;
        this.lines.forEach(line => {
          if (line.polyline) {
            line.polyline.mesh.program.uniforms.uEnableFade.value = this.enableFade ? 1.0 : 0.0;
          }
        });
      });
    }

    if (wavesInput) {
      wavesInput.addEventListener('change', (e) => {
        this.enableWaves = e.target.checked;
        const shaderStatusEl = document.getElementById('tel-shader-status');
        if (shaderStatusEl) {
          shaderStatusEl.innerText = this.enableWaves ? 'ACTIVE' : 'OFF';
        }
        this.lines.forEach(line => {
          if (line.polyline) {
            line.polyline.mesh.program.uniforms.uEnableShaderEffect.value = this.enableWaves ? 1.0 : 0.0;
          }
        });
      });
    }

    // Presets
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        presetButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.preset = e.target.getAttribute('data-preset');
        this.buildLines();
      });
    });

    // Reset Engine Action
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.preset = 'falcon';
        this.ribbonCount = 3;
        this.baseThickness = 30;
        this.speedMultiplier = 0.5;
        this.maxAge = 500;
        this.enableFade = true;
        this.enableWaves = true;

        // Reset Inputs in UI
        if (countInput) countInput.value = 3;
        if (thicknessInput) thicknessInput.value = 30;
        if (speedInput) speedInput.value = 0.5;
        if (maxAgeInput) maxAgeInput.value = 500;
        if (fadeInput) fadeInput.checked = true;
        if (wavesInput) wavesInput.checked = true;

        // Reset Text values
        if (countVal) countVal.innerText = 3;
        if (thicknessVal) thicknessVal.innerText = 30;
        if (speedVal) speedVal.innerText = '0.5';
        if (maxAgeVal) maxAgeVal.innerText = 500;

        presetButtons.forEach(b => {
          if (b.getAttribute('data-preset') === 'falcon') b.classList.add('active');
          else b.classList.remove('active');
        });

        const shaderStatusEl = document.getElementById('tel-shader-status');
        if (shaderStatusEl) shaderStatusEl.innerText = 'ACTIVE';

        // Rebuild lines
        this.buildLines();
        this.triggerSystemAlert('SYSTEM COLD REBOOT COMPLETE', 'status-nominal');
      });
    }

    // Telemetry Sync Action
    const syncBtn = document.getElementById('btn-sync');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => {
        this.triggerSystemAlert('RE-CALIBRATING TELEMETRY...', 'status-calibrating');
        setTimeout(() => {
          this.triggerSystemAlert('TELEMETRY SENSORS SYNCED', 'status-nominal');
        }, 1200);
      });
    }

    // Capture Scan Action
    const captureBtn = document.getElementById('btn-capture');
    if (captureBtn) {
      captureBtn.addEventListener('click', () => {
        this.triggerSystemAlert('CAPTURING HUD GRAPHICS...', 'status-calibrating');
        setTimeout(() => {
          this.captureCanvas();
        }, 300);
      });
    }
  }

  triggerSystemAlert(message, statusClass) {
    const statusEl = document.querySelector('.hud-status');
    if (statusEl) {
      statusEl.className = `hud-status ${statusClass || 'status-nominal'}`;
      statusEl.innerText = message;
      
      // Blink overlay effect
      const backgroundText = document.querySelector('.hud-main-title');
      if (backgroundText) {
        backgroundText.style.color = 'rgba(240, 240, 250, 0.12)';
        setTimeout(() => {
          backgroundText.style.color = '';
        }, 200);
      }
    }
  }

  captureCanvas() {
    try {
      this.renderer.render({ scene: this.scene });
      const url = this.gl.canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `spacex-telemetry-scan-${Date.now()}.png`;
      link.href = url;
      link.click();
      this.triggerSystemAlert('SYS NOMINAL', 'status-nominal');
    } catch (e) {
      console.error(e);
      this.triggerSystemAlert('CAPTURE FAILED', 'status-failed');
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const currentTime = performance.now();
    const dt = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Simulate mouse drift if user hasn't interacted
    if (!this.mouseMoved) {
      const time = currentTime * 0.001;
      const radius = 0.35;
      this.mouse.set(
        Math.cos(time * 0.8) * radius * 1.5,
        Math.sin(time * 1.3) * radius * 0.7,
        0
      );
    }

    // Telemetry calculations
    const dist = this.mouse.distance(this.prevMouse);
    this.prevMouse.copy(this.mouse);

    // Smooth speed calculations
    this.currentSpeed = this.currentSpeed * 0.9 + dist * 0.1;
    const speedKmS = (this.currentSpeed * 150).toFixed(2);
    
    const speedEl = document.getElementById('tel-speed');
    if (speedEl) speedEl.innerText = `${speedKmS} km/s`;

    // Coordinates update
    const mouseXEl = document.getElementById('tel-mouse-x');
    const mouseYEl = document.getElementById('tel-mouse-y');
    if (mouseXEl) mouseXEl.innerText = (this.mouse.x >= 0 ? '+' : '') + this.mouse.x.toFixed(4);
    if (mouseYEl) mouseYEl.innerText = (this.mouse.y >= 0 ? '+' : '') + this.mouse.y.toFixed(4);

    // FPS calculations
    this.fpsFrameCount++;
    if (currentTime - this.lastFpsTime >= 1000) {
      const fpsVal = document.getElementById('tel-fps');
      if (fpsVal) {
        fpsVal.innerText = ((this.fpsFrameCount * 1000) / (currentTime - this.lastFpsTime)).toFixed(1);
      }
      this.fpsFrameCount = 0;
      this.lastFpsTime = currentTime;
    }

    // Physics update for lines
    const tmp = new Vec3();
    this.lines.forEach(line => {
      // Calculate spring velocity towards mouse
      tmp.copy(this.mouse).add(line.mouseOffset).sub(line.points[0]).multiply(line.spring);
      line.mouseVelocity.add(tmp).multiply(line.friction);
      line.points[0].add(line.mouseVelocity);

      // Interpolate trail segments
      for (let i = 1; i < line.points.length; i++) {
        if (isFinite(this.maxAge) && this.maxAge > 0) {
          const segmentDelay = this.maxAge / (line.points.length - 1);
          const alpha = Math.min(1, (dt * this.speedMultiplier) / segmentDelay);
          line.points[i].lerp(line.points[i - 1], alpha);
        } else {
          line.points[i].lerp(line.points[i - 1], 0.9);
        }
      }

      // Update shader uniform time
      if (line.polyline.mesh.program.uniforms.uTime) {
        line.polyline.mesh.program.uniforms.uTime.value = currentTime * 0.001;
      }
      line.polyline.updateGeometry();
    });

    // Render scene
    this.renderer.render({ scene: this.scene });
  }
}

// Custom status CSS styles for sync trigger
const styleSheet = document.createElement('style');
styleSheet.innerText = `
  .status-calibrating {
    color: #ffaa00;
    background-color: rgba(255, 170, 0, 0.08);
    border: 1px solid rgba(255, 170, 0, 0.2);
  }
  .status-failed {
    color: #ff3333;
    background-color: rgba(255, 51, 51, 0.08);
    border: 1px solid rgba(255, 51, 51, 0.2);
  }
`;
document.head.appendChild(styleSheet);

// Initialize Telemetry and Ribbon Applications
document.addEventListener('DOMContentLoaded', () => {
  new SpaceBackground();
  new TelemetrySystem();
  new RibbonApp();

  // Collapsible control panel toggle logic
  const toggleBtn = document.getElementById('btn-toggle-panel');
  const panel = document.querySelector('.control-panel');
  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      if (panel.classList.contains('collapsed')) {
        toggleBtn.innerText = 'EXPAND ▲';
      } else {
        toggleBtn.innerText = 'COLLAPSE ▼';
      }
    });
  }
});
