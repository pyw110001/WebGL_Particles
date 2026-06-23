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

// ==========================================
// SHADER CODES FOR RIBBONS (OGL)
// ==========================================
const VERTEX_SHADER_RIBBONS = `
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

const FRAGMENT_SHADER_RIBBONS = `
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

// ==========================================
// COLOR UTILITIES
// ==========================================
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

// ==========================================
// GESTURE CONTROLLER (MEDIAPIPE POSE)
// ==========================================
class GestureController {
  constructor() {
    this.video = document.getElementById('webcam');
    this.canvas = document.getElementById('camera-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.statusEl = document.getElementById('tel-pose-status');
    this.coordsEl = document.getElementById('tel-wrist-coords');
    
    this.active = false;
    this.camera = null;
    this.pose = null;
    
    this.rawWristX = 0.5;
    this.rawWristY = 0.5;
    this.wristX = 0.5;
    this.wristY = 0.5;
    this.wristVisible = false;
    this.wristDetectedThisFrame = false;

    // 左手手势触发状态与计时器
    this.lastEffectOpenState = false;
    this.effectTriggerTimer = 0.0;
    this.colorTriggerTimer = 0.0;
  }

  init() {
    if (this.pose) return;

    this.updateStatus('yellow', 'LOADING MODEL...');

    this.pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.pose.onResults((results) => this.onResults(results));
  }

  async start() {
    this.active = true;
    this.init();

    try {
      if (!this.camera) {
        this.camera = new Camera(this.video, {
          onFrame: async () => {
            if (this.active) {
              await this.pose.send({ image: this.video });
            }
          },
          width: 320,
          height: 240
        });
      }
      this.updateStatus('yellow', 'CAMERA ACTIVE');
      await this.camera.start();
    } catch (err) {
      console.error('Camera start failed:', err);
      this.updateStatus('red', 'WEBCAM ERROR');
    }
  }

  stop() {
    this.active = false;
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }
    this.wristVisible = false;
    this.wristDetectedThisFrame = false;
    this.lastEffectOpenState = false;
    this.effectTriggerTimer = 0.0;
    this.colorTriggerTimer = 0.0;
    this.updateStatus('gray', 'OFFLINE');
    if (this.coordsEl) this.coordsEl.innerText = 'N/A';
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  updateStatus(colorClass, text) {
    if (!this.statusEl) return;
    this.statusEl.className = `tel-val font-mono status-${colorClass}`;
    this.statusEl.innerText = text;
  }

  triggerEffectSwitch() {
    const buttons = document.querySelectorAll('.effect-btn');
    let activeIndex = -1;
    buttons.forEach((btn, idx) => {
      if (btn.classList.contains('active')) {
        activeIndex = idx;
      }
    });
    if (activeIndex !== -1) {
      const nextIndex = (activeIndex + 1) % buttons.length;
      buttons[nextIndex].click();
    }
  }

  triggerPresetSwitch() {
    const buttons = document.querySelectorAll('.preset-btn');
    let activeIndex = -1;
    buttons.forEach((btn, idx) => {
      if (btn.classList.contains('active')) {
        activeIndex = idx;
      }
    });
    if (activeIndex !== -1) {
      const nextIndex = (activeIndex + 1) % buttons.length;
      buttons[nextIndex].click();
    }
  }

  onResults(results) {
    if (!this.active || !this.ctx) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // 1. 镜像绘制视频帧
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(results.image, 0, 0, width, height);
    ctx.restore();

    // 2. 绘制骨架和右肩、右手腕圈注
    if (results.poseLandmarks) {
      this.wristDetectedThisFrame = false;

      const rShoulder = results.poseLandmarks[12];
      const rWrist = results.poseLandmarks[16];
      
      const lShoulder = results.poseLandmarks[11];
      const lElbow = results.poseLandmarks[13];
      const lWrist = results.poseLandmarks[15];
      const lPinky = results.poseLandmarks[17];
      const lIndex = results.poseLandmarks[19];

      ctx.strokeStyle = 'rgba(0, 255, 170, 0.5)';
      ctx.lineWidth = 3;

      const drawLine = (p1, p2) => {
        if (p1 && p2 && p1.visibility > 0.5 && p2.visibility > 0.5) {
          ctx.beginPath();
          ctx.moveTo((1.0 - p1.x) * width, p1.y * height);
          ctx.lineTo((1.0 - p2.x) * width, p2.y * height);
          ctx.stroke();
        }
      };

      const dist3D = (p1, p2) => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = p1.z - p2.z;
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
      };

      const dist2D = (p1, p2) => {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx*dx + dy*dy);
      };

      // 右臂 (右肩 12 -> 右肘 14 -> 右手腕 16)
      drawLine(results.poseLandmarks[12], results.poseLandmarks[14]);
      drawLine(results.poseLandmarks[14], results.poseLandmarks[16]);

      // 左臂 (左肩 11 -> 左肘 13 -> 左手腕 15)
      drawLine(results.poseLandmarks[11], results.poseLandmarks[13]);
      drawLine(results.poseLandmarks[13], results.poseLandmarks[15]);

      // 躯干 (左肩 11 -> 右肩 12 -> 右胯 24 -> 左胯 23 -> 左肩 11)
      drawLine(results.poseLandmarks[11], results.poseLandmarks[12]);
      drawLine(results.poseLandmarks[12], results.poseLandmarks[24]);
      drawLine(results.poseLandmarks[24], results.poseLandmarks[23]);
      drawLine(results.poseLandmarks[23], results.poseLandmarks[11]);

      // 标注右肩 (12) 圈
      if (rShoulder && rShoulder.visibility > 0.5) {
        ctx.beginPath();
        ctx.arc((1.0 - rShoulder.x) * width, rShoulder.y * height, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#00ffaa';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 标注并验证右手腕 (16)
      if (rWrist && rWrist.visibility > 0.5) {
        this.wristDetectedThisFrame = true;
        this.rawWristX = 1.0 - rWrist.x; // 镜像翻转
        this.rawWristY = rWrist.y;
        this.wristVisible = true;

        // 腕点圈
        ctx.beginPath();
        ctx.arc(this.rawWristX * width, this.rawWristY * height, 8, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff3333';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 准星十字辅助线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.rawWristX * width - 12, this.rawWristY * height);
        ctx.lineTo(this.rawWristX * width + 12, this.rawWristY * height);
        ctx.moveTo(this.rawWristX * width, this.rawWristY * height - 12);
        ctx.lineTo(this.rawWristX * width, this.rawWristY * height + 12);
        ctx.stroke();

        this.updateStatus('green', 'LOCKED WRIST');
        if (this.coordsEl) {
          this.coordsEl.innerText = `${(this.rawWristX * 2 - 1).toFixed(2)}, ${(this.rawWristY * -2 + 1).toFixed(2)}`;
        }
      } else {
        this.wristVisible = false;
        this.updateStatus('yellow', 'NO WRIST DETECTED');
        if (this.coordsEl) this.coordsEl.innerText = 'N/A';
      }

      // 3. 左手手势检测（握拳切 EFFECT / 张手高举切 COLOR PRESET）
      if (lShoulder && rShoulder && lElbow && lWrist && lPinky && lIndex &&
          lShoulder.visibility > 0.5 && rShoulder.visibility > 0.5 &&
          lElbow.visibility > 0.5 && lWrist.visibility > 0.5) {
        
        const shoulderDist = dist3D(lShoulder, rShoulder);
        const wristToPinky = dist3D(lWrist, lPinky);
        const wristToIndex = dist3D(lWrist, lIndex);
        const avgHandDist = (wristToPinky + wristToIndex) / 2.0;
        const handRatio = avgHandDist / shoulderDist;
        
        const isHandRaised = lWrist.y < (lElbow.y + 0.05); // 左手高度高于肘部偏下5%屏高
        const isOpenHand = handRatio > 0.14; // 张开手判定
        
        const lWristCanvasX = (1.0 - lWrist.x) * width;
        const lWristCanvasY = lWrist.y * height;

        // 绘制实时调试信息框
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(lWristCanvasX + 15, lWristCanvasY - 25, 80, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 7px monospace';
        ctx.fillText(`Ratio: ${handRatio.toFixed(3)}`, lWristCanvasX + 19, lWristCanvasY - 17);
        ctx.fillText(`Raised: ${isHandRaised ? 'YES' : 'NO'}`, lWristCanvasX + 19, lWristCanvasY - 8);

        const isHighRaised = lWrist.y < lShoulder.y;
        
        // 判定特效切换：左手张开，抬起且低于左肩
        const isEffectTriggerZone = isHandRaised && !isHighRaised && isOpenHand;

        if (isEffectTriggerZone) {
          if (this.lastEffectOpenState) {
            // 已触发状态：画出稳定指示圈和文字
            ctx.beginPath();
            ctx.arc(lWristCanvasX, lWristCanvasY, 13, 0, 2 * Math.PI);
            ctx.strokeStyle = '#00F2FE';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            
            ctx.fillStyle = '#00F2FE';
            ctx.font = 'bold 8px monospace';
            ctx.fillText('OPEN [SWAP EFFECT]', lWristCanvasX + 18, lWristCanvasY + 3);
          } else {
            this.effectTriggerTimer += 0.033;
            
            // 悬停中：画出快速加载进度环 (0.25 秒 hover 防抖动)
            const progress = Math.min(1.0, this.effectTriggerTimer / 0.25);
            ctx.beginPath();
            ctx.arc(lWristCanvasX, lWristCanvasY, 13, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
            ctx.strokeStyle = '#00F2FE';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            
            if (this.effectTriggerTimer >= 0.25) {
              this.triggerEffectSwitch();
              this.lastEffectOpenState = true;
              this.effectTriggerTimer = 0.0;
            }
          }
        } else {
          this.effectTriggerTimer = 0.0;
          if (!isOpenHand || !isHandRaised || isHighRaised) {
            this.lastEffectOpenState = false;
          }
          
          // 高举过肩张开手切换 COLOR PRESET (1 秒悬停)
          if (isHandRaised && isHighRaised && isOpenHand) {
            if (this.colorTriggerTimer >= 0) {
              this.colorTriggerTimer += 0.033; // 按帧步长计时
              
              const progress = Math.min(1.0, this.colorTriggerTimer / 1.0);
              const lWristCanvasX = (1.0 - lWrist.x) * width;
              const lWristCanvasY = lWrist.y * height;
              
              // 绘制背景空圆环
              ctx.beginPath();
              ctx.arc(lWristCanvasX, lWristCanvasY, 13, 0, 2 * Math.PI);
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.lineWidth = 2;
              ctx.stroke();
              
              // 绘制高亮进度圆环
              ctx.beginPath();
              ctx.arc(lWristCanvasX, lWristCanvasY, 13, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
              ctx.strokeStyle = '#00ffaa';
              ctx.lineWidth = 2.5;
              ctx.stroke();
              
              ctx.fillStyle = '#00ffaa';
              ctx.font = 'bold 8px monospace';
              ctx.fillText(`HOLD [PRESET] ${Math.floor(progress * 100)}%`, lWristCanvasX + 16, lWristCanvasY + 3);
              
              if (this.colorTriggerTimer >= 1.0) {
                this.triggerPresetSwitch();
                this.colorTriggerTimer = -1.0; // 锁定，等手放下后重置
              }
            } else {
              // 锁定状态提示
              ctx.fillStyle = '#ffaa00';
              ctx.font = 'bold 8px monospace';
              ctx.fillText('LOCKED (RELEASE HAND)', (1.0 - lWrist.x) * width + 16, lWrist.y * height + 3);
            }
          } else {
            this.colorTriggerTimer = 0.0;
          }
        }
      }
    } else {
      this.wristVisible = false;
      this.updateStatus('yellow', 'NO BODY DETECTED');
      if (this.coordsEl) this.coordsEl.innerText = 'N/A';
    }
  }

  updateSmoothCoords() {
    if (this.wristVisible && this.wristDetectedThisFrame) {
      this.wristX = this.wristX + (this.rawWristX - this.wristX) * 0.18;
      this.wristY = this.wristY + (this.rawWristY - this.wristY) * 0.18;
    }
    return {
      x: this.wristX,
      y: this.wristY,
      visible: this.wristVisible
    };
  }
}

// ==========================================
// THREE.JS PARTICLES BACKGROUND
// ==========================================
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
      const x = (Math.random() - 0.5) * 16;
      const y = (Math.random() - 0.5) * 16;
      const z = (Math.random() - 0.5) * 12 - 2;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const colorJitter = Math.random() * 0.25;
      colors[i * 3] = baseColor.r - colorJitter * 0.1;
      colors[i * 3 + 1] = baseColor.g - colorJitter * 0.05;
      colors[i * 3 + 2] = baseColor.b + colorJitter * 0.15;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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

    if (this.points) {
      this.points.rotation.y += 0.0002;
      this.points.rotation.x += 0.0001;
    }

    this.camera.position.x += (this.mouseTarget.x - this.camera.position.x) * 0.05;
    this.camera.position.y += (this.mouseTarget.y - this.camera.position.y) * 0.05;
    this.camera.lookAt(0, 0, -2);

    this.renderer.render(this.scene, this.camera);
  }
}

// ==========================================
// TELEMETRY PANEL UPDATER
// ==========================================
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

// ==========================================
// EFFECT 1: WEBGL RIBBONS (OGL)
// ==========================================
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
    this.paused = false; // Ribbons active by default
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
    this.lines.forEach(line => {
      if (line.polyline && line.polyline.mesh) {
        line.polyline.mesh.setParent(null);
      }
    });
    this.lines = [];

    const colors = getColorsForCount(this.preset, this.ribbonCount);
    const center = (colors.length - 1) / 2;

    colors.forEach((color, index) => {
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
        vertex: VERTEX_SHADER_RIBBONS,
        fragment: FRAGMENT_SHADER_RIBBONS,
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
    if (activeTrailsEl && !this.paused) activeTrailsEl.innerText = this.lines.length;
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

  pause() {
    this.paused = true;
  }

  resume() {
    if (this.paused) {
      this.paused = false;
      this.lastTime = performance.now();
      this.animate();
      
      // Sync UI stats
      const activeTrailsEl = document.getElementById('tel-active-trails');
      if (activeTrailsEl) activeTrailsEl.innerText = this.lines.length;
      const shaderStatusEl = document.getElementById('tel-shader-status');
      if (shaderStatusEl) shaderStatusEl.innerText = this.enableWaves ? 'ACTIVE' : 'OFF';
    }
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.resize());

    // Mouse & Touch interaction
    const updateMouse = (e) => {
      if (this.paused) return;
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
        if (!this.paused) {
          const shaderStatusEl = document.getElementById('tel-shader-status');
          if (shaderStatusEl) shaderStatusEl.innerText = this.enableWaves ? 'ACTIVE' : 'OFF';
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
        btn.classList.add('active');
        this.preset = btn.getAttribute('data-preset');
        this.buildLines();

        // Sync colors to fluid if active
        if (window.fluidApp) {
          const colorsMap = {
            falcon: '#5227FF',
            starlink: '#00F2FE',
            dragon: '#FF0844',
            superheavy: '#FAD961'
          };
          window.fluidApp.config.COLOR = colorsMap[this.preset] || '#5227FF';
        }
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

        if (countInput) countInput.value = 3;
        if (thicknessInput) thicknessInput.value = 30;
        if (speedInput) speedInput.value = 0.5;
        if (maxAgeInput) maxAgeInput.value = 500;
        if (fadeInput) fadeInput.checked = true;
        if (wavesInput) wavesInput.checked = true;

        if (countVal) countVal.innerText = 3;
        if (thicknessVal) thicknessVal.innerText = 30;
        if (speedVal) speedVal.innerText = '0.5';
        if (maxAgeVal) maxAgeVal.innerText = 500;

        presetButtons.forEach(b => {
          if (b.getAttribute('data-preset') === 'falcon') b.classList.add('active');
          else b.classList.remove('active');
        });

        const shaderStatusEl = document.getElementById('tel-shader-status');
        if (shaderStatusEl && !this.paused) shaderStatusEl.innerText = 'ACTIVE';

        this.buildLines();

        if (window.fluidApp) {
          window.fluidApp.reset();
        }

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
      let canvas;
      const activeEffect = document.querySelector('.effect-btn.active').getAttribute('data-effect');
      if (activeEffect === 'ribbons') {
        this.renderer.render({ scene: this.scene });
        canvas = this.gl.canvas;
      } else {
        canvas = window.fluidApp.canvas;
      }
      
      const url = canvas.toDataURL('image/png');
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
    if (this.paused) return;
    requestAnimationFrame(() => this.animate());

    const currentTime = performance.now();
    const dt = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // 手势模式坐标劫持
    if (window.controlMode === 'gesture' && window.gestureController && window.gestureController.active) {
      const coords = window.gestureController.updateSmoothCoords();
      if (coords.visible) {
        this.mouseMoved = true;
        const targetX = coords.x * 2 - 1;
        const targetY = (1.0 - coords.y) * 2 - 1;
        this.mouse.set(targetX, targetY, 0);
      }
    }

    if (!this.mouseMoved) {
      const time = currentTime * 0.001;
      const radius = 0.35;
      this.mouse.set(
        Math.cos(time * 0.8) * radius * 1.5,
        Math.sin(time * 1.3) * radius * 0.7,
        0
      );
    }

    const dist = this.mouse.distance(this.prevMouse);
    this.prevMouse.copy(this.mouse);

    this.currentSpeed = this.currentSpeed * 0.9 + dist * 0.1;
    const speedKmS = (this.currentSpeed * 150).toFixed(2);
    
    const speedEl = document.getElementById('tel-speed');
    if (speedEl) speedEl.innerText = `${speedKmS} km/s`;

    const mouseXEl = document.getElementById('tel-mouse-x');
    const mouseYEl = document.getElementById('tel-mouse-y');
    if (mouseXEl) mouseXEl.innerText = (this.mouse.x >= 0 ? '+' : '') + this.mouse.x.toFixed(4);
    if (mouseYEl) mouseYEl.innerText = (this.mouse.y >= 0 ? '+' : '') + this.mouse.y.toFixed(4);

    this.fpsFrameCount++;
    if (currentTime - this.lastFpsTime >= 1000) {
      const fpsVal = document.getElementById('tel-fps');
      if (fpsVal) {
        fpsVal.innerText = ((this.fpsFrameCount * 1000) / (currentTime - this.lastFpsTime)).toFixed(1);
      }
      this.fpsFrameCount = 0;
      this.lastFpsTime = currentTime;
    }

    const tmp = new Vec3();
    this.lines.forEach(line => {
      tmp.copy(this.mouse).add(line.mouseOffset).sub(line.points[0]).multiply(line.spring);
      line.mouseVelocity.add(tmp).multiply(line.friction);
      line.points[0].add(line.mouseVelocity);

      for (let i = 1; i < line.points.length; i++) {
        if (isFinite(this.maxAge) && this.maxAge > 0) {
          const segmentDelay = this.maxAge / (line.points.length - 1);
          const alpha = Math.min(1, (dt * this.speedMultiplier) / segmentDelay);
          line.points[i].lerp(line.points[i - 1], alpha);
        } else {
          line.points[i].lerp(line.points[i - 1], 0.9);
        }
      }

      if (line.polyline.mesh.program.uniforms.uTime) {
        line.polyline.mesh.program.uniforms.uTime.value = currentTime * 0.001;
      }
      line.polyline.updateGeometry();
    });

    this.renderer.render({ scene: this.scene });
  }
}

// ==========================================
// FLUID HELPER CLASSES (FluidMaterial & FluidProgram)
// ==========================================
class FluidMaterial {
  constructor(gl, vertexShader, fragmentShaderSource) {
    this.gl = gl;
    this.vertexShader = vertexShader;
    this.fragmentShaderSource = fragmentShaderSource;
    this.programs = [];
    this.activeProgram = null;
    this.uniforms = [];
  }
  setKeywords(keywords) {
    let hash = 0;
    for (let i = 0; i < keywords.length; i++) hash += this.hashCode(keywords[i]);
    let program = this.programs[hash];
    if (program == null) {
      let fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, this.fragmentShaderSource, keywords);
      program = this.createProgram(this.vertexShader, fragmentShader);
      this.programs[hash] = program;
    }
    if (program === this.activeProgram) return;
    this.uniforms = this.getUniforms(program);
    this.activeProgram = program;
  }
  bind() {
    this.gl.useProgram(this.activeProgram);
  }
  createProgram(vertexShader, fragmentShader) {
    let program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) console.trace(this.gl.getProgramInfoLog(program));
    return program;
  }
  getUniforms(program) {
    let uniforms = [];
    let uniformCount = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      let uniformName = this.gl.getActiveUniform(program, i).name;
      uniforms[uniformName] = this.gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
  }
  compileShader(type, source, keywords) {
    source = this.addKeywords(source, keywords);
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) console.trace(this.gl.getShaderInfoLog(shader));
    return shader;
  }
  addKeywords(source, keywords) {
    if (!keywords) return source;
    let keywordsString = '';
    keywords.forEach(keyword => {
      keywordsString += '#define ' + keyword + '\n';
    });
    return keywordsString + source;
  }
  hashCode(s) {
    if (s.length === 0) return 0;
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = (hash << 5) - hash + s.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}

class FluidProgram {
  constructor(gl, vertexShader, fragmentShader) {
    this.gl = gl;
    this.uniforms = {};
    this.program = this.createProgram(vertexShader, fragmentShader);
    this.uniforms = this.getUniforms(this.program);
  }
  bind() {
    this.gl.useProgram(this.program);
  }
  createProgram(vertexShader, fragmentShader) {
    let program = this.gl.createProgram();
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) console.trace(this.gl.getProgramInfoLog(program));
    return program;
  }
  getUniforms(program) {
    let uniforms = [];
    let uniformCount = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      let uniformName = this.gl.getActiveUniform(program, i).name;
      uniforms[uniformName] = this.gl.getUniformLocation(program, uniformName);
    }
    return uniforms;
  }
}

// ==========================================
// EFFECT 2: FLUID SIMULATION SPLASH CURSOR
// ==========================================
class FluidApp {
  constructor() {
    this.canvas = document.getElementById('fluid-canvas');
    if (!this.canvas) return;

    this.paused = true; // Started as paused, Ribbons active first
    this.mouseMoved = false;
    this.fpsFrameCount = 0;
    this.lastFpsTime = performance.now();

    this.config = {
      SIM_RESOLUTION: 128,
      DYE_RESOLUTION: 1440,
      CAPTURE_RESOLUTION: 512,
      DENSITY_DISSIPATION: 3.5714, // 10.0 / 2.8s
      VELOCITY_DISSIPATION: 2.0,
      PRESSURE: 0.1,
      PRESSURE_ITERATIONS: 20,
      CURL: 3.0,
      SPLAT_RADIUS: 0.2,
      SPLAT_FORCE: 6000,
      SHADING: true,
      COLOR_UPDATE_SPEED: 10,
      PAUSED: false,
      BACK_COLOR: { r: 0.0, g: 0.0, b: 0.0 },
      TRANSPARENT: true,
      RAINBOW_MODE: true,
      COLOR: '#5227FF'
    };

    // Pointer state
    this.pointers = [];
    const self = this;
    this.pointerPrototype = function() {
      this.id = -1;
      this.texcoordX = 0;
      this.texcoordY = 0;
      this.prevTexcoordX = 0;
      this.prevTexcoordY = 0;
      this.deltaX = 0;
      this.deltaY = 0;
      this.down = false;
      this.moved = false;
      this.color = { r: 0, g: 0, b: 0 };
    };
    this.pointers.push(new this.pointerPrototype());

    // Setup WebGL Context and extensions
    const ctxData = this.getWebGLContext(this.canvas);
    this.gl = ctxData.gl;
    this.ext = ctxData.ext;

    if (!this.ext.supportLinearFiltering) {
      this.config.DYE_RESOLUTION = 256;
      this.config.SHADING = false;
    }

    this.setupShadersAndPrograms();
    this.initFramebuffers();
    this.setupEventListeners();

    this.lastUpdateTime = Date.now();
    this.colorUpdateTimer = 0.0;
  }

  getWebGLContext(canvas) {
    const params = {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: true
    };
    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    
    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }
    
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat && halfFloat.HALF_FLOAT_OES;
    let formatRGBA;
    let formatRG;
    let formatR;

    if (isWebGL2) {
      formatRGBA = this.getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
      formatRG = this.getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
      formatR = this.getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    } else {
      formatRGBA = this.getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatRG = this.getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatR = this.getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }

    return {
      gl,
      ext: {
        formatRGBA,
        formatRG,
        formatR,
        halfFloatTexType,
        supportLinearFiltering
      }
    };
  }

  getSupportedFormat(gl, internalFormat, format, type) {
    if (!this.supportRenderTextureFormat(gl, internalFormat, format, type)) {
      switch (internalFormat) {
        case gl.R16F:
          return this.getSupportedFormat(gl, gl.RG16F, gl.RG, type);
        case gl.RG16F:
          return this.getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
        default:
          return null;
      }
    }
    return { internalFormat, format };
  }

  supportRenderTextureFormat(gl, internalFormat, format, type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    return status === gl.FRAMEBUFFER_COMPLETE;
  }

  setupShadersAndPrograms() {
    const gl = this.gl;

    const compileShaderLocal = (type, source, keywords) => {
      if (keywords) {
        let keywordsString = '';
        keywords.forEach(keyword => {
          keywordsString += '#define ' + keyword + '\n';
        });
        source = keywordsString + source;
      }
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.trace(gl.getShaderInfoLog(shader));
      return shader;
    };

    const baseVertexShader = compileShaderLocal(
      gl.VERTEX_SHADER,
      `
        precision highp float;
        attribute vec2 aPosition;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform vec2 texelSize;

        void main () {
            vUv = aPosition * 0.5 + 0.5;
            vL = vUv - vec2(texelSize.x, 0.0);
            vR = vUv + vec2(texelSize.x, 0.0);
            vT = vUv + vec2(0.0, texelSize.y);
            vB = vUv - vec2(0.0, texelSize.y);
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `
    );

    const copyShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        uniform sampler2D uTexture;

        void main () {
            gl_FragColor = texture2D(uTexture, vUv);
        }
      `
    );

    const clearShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        uniform sampler2D uTexture;
        uniform float value;

        void main () {
            gl_FragColor = value * texture2D(uTexture, vUv);
        }
     `
    );

    const displayShaderSource = `
      precision highp float;
      precision highp sampler2D;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uTexture;
      uniform sampler2D uDithering;
      uniform vec2 ditherScale;
      uniform vec2 texelSize;

      vec3 linearToGamma (vec3 color) {
          color = max(color, vec3(0));
          return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
      }

      void main () {
          vec3 c = texture2D(uTexture, vUv).rgb;
          #ifdef SHADING
              vec3 lc = texture2D(uTexture, vL).rgb;
              vec3 rc = texture2D(uTexture, vR).rgb;
              vec3 tc = texture2D(uTexture, vT).rgb;
              vec3 bc = texture2D(uTexture, vB).rgb;

              float dx = length(rc) - length(lc);
              float dy = length(tc) - length(bc);

              vec3 n = normalize(vec3(dx, dy, length(texelSize)));
              vec3 l = vec3(0.0, 0.0, 1.0);

              float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
              c *= diffuse;
          #endif

          float a = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c, a);
      }
    `;

    const splatShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTarget;
        uniform float aspectRatio;
        uniform vec3 color;
        uniform vec2 point;
        uniform float radius;

        void main () {
            vec2 p = vUv - point.xy;
            p.x *= aspectRatio;
            vec3 splat = exp(-dot(p, p) / radius) * color;
            vec3 base = texture2D(uTarget, vUv).xyz;
            gl_FragColor = vec4(base + splat, 1.0);
        }
      `
    );

    const advectionShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform vec2 dyeTexelSize;
        uniform float dt;
        uniform float dissipation;

        vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
            vec2 st = uv / tsize - 0.5;
            vec2 iuv = floor(st);
            vec2 fuv = fract(st);

            vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
            vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
            vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
            vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

            return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
        }

        void main () {
            #ifdef MANUAL_FILTERING
                vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
                vec4 result = bilerp(uSource, coord, dyeTexelSize);
            #else
                vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
                vec4 result = texture2D(uSource, coord);
            #endif
            float decay = 1.0 + dissipation * dt;
            gl_FragColor = result / decay;
        }
      `,
      this.ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']
    );

    const divergenceShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uVelocity;

        void main () {
            float L = texture2D(uVelocity, vL).x;
            float R = texture2D(uVelocity, vR).x;
            float T = texture2D(uVelocity, vT).y;
            float B = texture2D(uVelocity, vB).y;

            vec2 C = texture2D(uVelocity, vUv).xy;
            if (vL.x < 0.0) { L = -C.x; }
            if (vR.x > 1.0) { R = -C.x; }
            if (vT.y > 1.0) { T = -C.y; }
            if (vB.y < 0.0) { B = -C.y; }

            float div = 0.5 * (R - L + T - B);
            gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
        }
      `
    );

    const curlShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uVelocity;

        void main () {
            float L = texture2D(uVelocity, vL).y;
            float R = texture2D(uVelocity, vR).y;
            float T = texture2D(uVelocity, vT).x;
            float B = texture2D(uVelocity, vB).x;
            float vorticity = R - L - T + B;
            gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
        }
      `
    );

    const vorticityShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curl;
        uniform float dt;

        void main () {
            float L = texture2D(uCurl, vL).x;
            float R = texture2D(uCurl, vR).x;
            float T = texture2D(uCurl, vT).x;
            float B = texture2D(uCurl, vB).x;
            float C = texture2D(uCurl, vUv).x;

            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force /= length(force) + 0.0001;
            force *= curl * C;
            force.y *= -1.0;

            vec2 velocity = texture2D(uVelocity, vUv).xy;
            velocity += force * dt;
            velocity = min(max(velocity, -1000.0), 1000.0);
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
      `
    );

    const pressureShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;

        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            float C = texture2D(uPressure, vUv).x;
            float divergence = texture2D(uDivergence, vUv).x;
            float pressure = (L + R + B + T - divergence) * 0.25;
            gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
      `
    );

    const gradientSubtractShader = compileShaderLocal(
      gl.FRAGMENT_SHADER,
      `
        precision mediump float;
        precision mediump sampler2D;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;

        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            vec2 velocity = texture2D(uVelocity, vUv).xy;
            velocity.xy -= vec2(R - L, T - B);
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
      `
    );

    // Quad geometry setups
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    this.blit = (target, clear = false) => {
      if (target == null) {
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.viewport(0, 0, target.width, target.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      }
      if (clear) {
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };

    // Instantiate programs
    this.copyProgram = new FluidProgram(gl, baseVertexShader, copyShader);
    this.clearProgram = new FluidProgram(gl, baseVertexShader, clearShader);
    this.splatProgram = new FluidProgram(gl, baseVertexShader, splatShader);
    this.advectionProgram = new FluidProgram(gl, baseVertexShader, advectionShader);
    this.divergenceProgram = new FluidProgram(gl, baseVertexShader, divergenceShader);
    this.curlProgram = new FluidProgram(gl, baseVertexShader, curlShader);
    this.vorticityProgram = new FluidProgram(gl, baseVertexShader, vorticityShader);
    this.pressureProgram = new FluidProgram(gl, baseVertexShader, pressureShader);
    this.gradienSubtractProgram = new FluidProgram(gl, baseVertexShader, gradientSubtractShader);
    this.displayMaterial = new FluidMaterial(gl, baseVertexShader, displayShaderSource);

    this.updateKeywords();
  }

  initFramebuffers() {
    const gl = this.gl;
    let simRes = this.getResolution(this.config.SIM_RESOLUTION);
    let dyeRes = this.getResolution(this.config.DYE_RESOLUTION);
    const texType = this.ext.halfFloatTexType;
    const rgba = this.ext.formatRGBA;
    const rg = this.ext.formatRG;
    const r = this.ext.formatR;
    const filtering = this.ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    
    gl.disable(gl.BLEND);

    if (!this.dye)
      this.dye = this.createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
    else
      this.dye = this.resizeDoubleFBO(this.dye, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);

    if (!this.velocity)
      this.velocity = this.createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
    else
      this.velocity = this.resizeDoubleFBO(
        this.velocity,
        simRes.width,
        simRes.height,
        rg.internalFormat,
        rg.format,
        texType,
        filtering
      );

    this.divergence = this.createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    this.curl = this.createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    this.pressure = this.createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  }

  createFBO(w, h, internalFormat, format, type, param) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let texelSizeX = 1.0 / w;
    let texelSizeY = 1.0 / h;
    return {
      texture,
      fbo,
      width: w,
      height: h,
      texelSizeX,
      texelSizeY,
      attach(id) {
        gl.activeTexture(gl.TEXTURE0 + id);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return id;
      }
    };
  }

  createDoubleFBO(w, h, internalFormat, format, type, param) {
    let fbo1 = this.createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = this.createFBO(w, h, internalFormat, format, type, param);
    return {
      width: w,
      height: h,
      texelSizeX: fbo1.texelSizeX,
      texelSizeY: fbo1.texelSizeY,
      get read() {
        return fbo1;
      },
      set read(value) {
        fbo1 = value;
      },
      get write() {
        return fbo2;
      },
      set write(value) {
        fbo2 = value;
      },
      swap() {
        let temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      }
    };
  }

  resizeFBO(target, w, h, internalFormat, format, type, param) {
    const gl = this.gl;
    let newFBO = this.createFBO(w, h, internalFormat, format, type, param);
    this.copyProgram.bind();
    gl.uniform1i(this.copyProgram.uniforms.uTexture, target.attach(0));
    this.blit(newFBO);
    return newFBO;
  }

  resizeDoubleFBO(target, w, h, internalFormat, format, type, param) {
    if (target.width === w && target.height === h) return target;
    target.read = this.resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = this.createFBO(w, h, internalFormat, format, type, param);
    target.width = w;
    target.height = h;
    target.texelSizeX = 1.0 / w;
    target.texelSizeY = 1.0 / h;
    return target;
  }

  updateKeywords() {
    let displayKeywords = [];
    if (this.config.SHADING) displayKeywords.push('SHADING');
    this.displayMaterial.setKeywords(displayKeywords);
  }

  getResolution(resolution) {
    let aspectRatio = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight;
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
    const min = Math.round(resolution);
    const max = Math.round(resolution * aspectRatio);
    if (this.gl.drawingBufferWidth > this.gl.drawingBufferHeight) return { width: max, height: min };
    else return { width: min, height: max };
  }

  scaleByPixelRatio(input) {
    const pixelRatio = window.devicePixelRatio || 1;
    return Math.floor(input * pixelRatio);
  }

  pause() {
    this.paused = true;
  }

  resume() {
    if (this.paused) {
      this.paused = false;
      this.lastUpdateTime = Date.now();
      this.updateFrame();

      // Sync UI stats
      const activeTrailsEl = document.getElementById('tel-active-trails');
      if (activeTrailsEl) activeTrailsEl.innerText = '1';
      const shaderStatusEl = document.getElementById('tel-shader-status');
      if (shaderStatusEl) shaderStatusEl.innerText = this.config.SHADING ? 'ACTIVE' : 'OFF';
    }
  }

  setupEventListeners() {
    window.addEventListener('resize', () => {
      if (this.resizeCanvas()) this.initFramebuffers();
    });

    window.addEventListener('mousedown', e => {
      if (this.paused) return;
      let pointer = this.pointers[0];
      let posX = this.scaleByPixelRatio(e.clientX);
      let posY = this.scaleByPixelRatio(e.clientY);
      this.updatePointerDownData(pointer, -1, posX, posY);
      this.clickSplat(pointer);
    });

    window.addEventListener('mousemove', e => {
      if (this.paused) return;
      let pointer = this.pointers[0];
      
      // If color is uninitialized, generate one
      if (pointer.color.r === 0 && pointer.color.g === 0 && pointer.color.b === 0) {
        pointer.color = this.generateColor();
      }

      let posX = this.scaleByPixelRatio(e.clientX);
      let posY = this.scaleByPixelRatio(e.clientY);
      this.updatePointerMoveData(pointer, posX, posY, pointer.color);
    });

    window.addEventListener('touchstart', e => {
      if (this.paused) return;
      const touches = e.targetTouches;
      let pointer = this.pointers[0];
      for (let i = 0; i < touches.length; i++) {
        let posX = this.scaleByPixelRatio(touches[i].clientX);
        let posY = this.scaleByPixelRatio(touches[i].clientY);
        this.updatePointerDownData(pointer, touches[i].identifier, posX, posY);
      }
    });

    window.addEventListener('touchmove', e => {
      if (this.paused) return;
      const touches = e.targetTouches;
      let pointer = this.pointers[0];
      
      if (pointer.color.r === 0 && pointer.color.g === 0 && pointer.color.b === 0) {
        pointer.color = this.generateColor();
      }

      for (let i = 0; i < touches.length; i++) {
        let posX = this.scaleByPixelRatio(touches[i].clientX);
        let posY = this.scaleByPixelRatio(touches[i].clientY);
        this.updatePointerMoveData(pointer, posX, posY, pointer.color);
      }
    }, { passive: true });

    window.addEventListener('touchend', e => {
      if (this.paused) return;
      const touches = e.changedTouches;
      let pointer = this.pointers[0];
      for (let i = 0; i < touches.length; i++) {
        this.updatePointerUpData(pointer);
      }
    });

    // Slider settings bindings
    const curlInput = document.getElementById('input-curl');
    const radiusInput = document.getElementById('input-splat-radius');
    const velDissInput = document.getElementById('input-vel-diss');
    const particlesTimeInput = document.getElementById('input-particles-time');
    const rainbowInput = document.getElementById('input-rainbow');
    const shadingInput = document.getElementById('input-shading');

    const curlVal = document.getElementById('val-curl');
    const radiusVal = document.getElementById('val-splat-radius');
    const velDissVal = document.getElementById('val-vel-diss');
    const particlesTimeVal = document.getElementById('val-particles-time');

    if (curlInput) {
      curlInput.addEventListener('input', (e) => {
        this.config.CURL = parseFloat(e.target.value);
        if (curlVal) curlVal.innerText = this.config.CURL.toFixed(1);
      });
    }

    if (radiusInput) {
      radiusInput.addEventListener('input', (e) => {
        this.config.SPLAT_RADIUS = parseFloat(e.target.value);
        if (radiusVal) radiusVal.innerText = this.config.SPLAT_RADIUS.toFixed(2);
      });
    }

    if (velDissInput) {
      velDissInput.addEventListener('input', (e) => {
        this.config.VELOCITY_DISSIPATION = parseFloat(e.target.value);
        if (velDissVal) velDissVal.innerText = this.config.VELOCITY_DISSIPATION.toFixed(1);
      });
    }

    if (particlesTimeInput) {
      particlesTimeInput.addEventListener('input', (e) => {
        const timeVal = parseFloat(e.target.value);
        this.config.DENSITY_DISSIPATION = 10.0 / timeVal;
        if (particlesTimeVal) particlesTimeVal.innerText = timeVal.toFixed(1) + 's';
      });
    }

    if (rainbowInput) {
      rainbowInput.addEventListener('change', (e) => {
        this.config.RAINBOW_MODE = e.target.checked;
      });
    }

    if (shadingInput) {
      shadingInput.addEventListener('change', (e) => {
        this.config.SHADING = e.target.checked;
        if (!this.paused) {
          const shaderStatusEl = document.getElementById('tel-shader-status');
          if (shaderStatusEl) shaderStatusEl.innerText = this.config.SHADING ? 'ACTIVE' : 'OFF';
        }
        this.updateKeywords();
      });
    }
  }

  reset() {
    this.config.CURL = 3.0;
    this.config.SPLAT_RADIUS = 0.2;
    this.config.VELOCITY_DISSIPATION = 2.0;
    this.config.DENSITY_DISSIPATION = 3.5714;
    this.config.RAINBOW_MODE = true;
    this.config.SHADING = true;

    const curlInput = document.getElementById('input-curl');
    const radiusInput = document.getElementById('input-splat-radius');
    const velDissInput = document.getElementById('input-vel-diss');
    const particlesTimeInput = document.getElementById('input-particles-time');
    const rainbowInput = document.getElementById('input-rainbow');
    const shadingInput = document.getElementById('input-shading');

    if (curlInput) curlInput.value = 3.0;
    if (radiusInput) radiusInput.value = 0.2;
    if (velDissInput) velDissInput.value = 2.0;
    if (particlesTimeInput) particlesTimeInput.value = 2.8;
    if (rainbowInput) rainbowInput.checked = true;
    if (shadingInput) shadingInput.checked = true;

    const curlVal = document.getElementById('val-curl');
    const radiusVal = document.getElementById('val-splat-radius');
    const velDissVal = document.getElementById('val-vel-diss');
    const particlesTimeVal = document.getElementById('val-particles-time');

    if (curlVal) curlVal.innerText = '3.0';
    if (radiusVal) radiusVal.innerText = '0.20';
    if (velDissVal) velDissVal.innerText = '2.0';
    if (particlesTimeVal) particlesTimeVal.innerText = '2.8s';

    this.updateKeywords();
  }

  resizeCanvas() {
    let clientW = this.canvas.clientWidth;
    let clientH = this.canvas.clientHeight;
    if (clientW === 0 || clientH === 0) {
      return false; // Skip if hidden
    }
    let width = this.scaleByPixelRatio(clientW);
    let height = this.scaleByPixelRatio(clientH);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      return true;
    }
    return false;
  }

  updateFrame() {
    if (this.paused) return;
    requestAnimationFrame(() => this.updateFrame());

    const dt = this.calcDeltaTime();
    if (this.resizeCanvas()) this.initFramebuffers();
    this.updateColors(dt);
    this.applyInputs();
    this.step(dt);
    this.render(null);

    // Update telemetry speed and FPS
    const pointer = this.pointers[0];
    const mouseXEl = document.getElementById('tel-mouse-x');
    const mouseYEl = document.getElementById('tel-mouse-y');
    const speedEl = document.getElementById('tel-speed');
    const fpsVal = document.getElementById('tel-fps');

    if (mouseXEl) mouseXEl.innerText = (pointer.texcoordX >= 0.5 ? '+' : '') + ((pointer.texcoordX * 2 - 1).toFixed(4));
    if (mouseYEl) mouseYEl.innerText = (pointer.texcoordY >= 0.5 ? '+' : '') + ((pointer.texcoordY * 2 - 1).toFixed(4));

    const dxNorm = pointer.deltaX;
    const dyNorm = pointer.deltaY;
    const drawSpdVal = Math.sqrt(dxNorm * dxNorm + dyNorm * dyNorm);
    const simulatedSpeed = (drawSpdVal * 400).toFixed(2);
    if (speedEl) speedEl.innerText = `${simulatedSpeed} km/s`;

    // FPS
    const currentTime = performance.now();
    this.fpsFrameCount++;
    if (currentTime - this.lastFpsTime >= 1000) {
      if (fpsVal) {
        fpsVal.innerText = ((this.fpsFrameCount * 1000) / (currentTime - this.lastFpsTime)).toFixed(1);
      }
      this.fpsFrameCount = 0;
      this.lastFpsTime = currentTime;
    }
  }

  calcDeltaTime() {
    let now = Date.now();
    let dt = (now - this.lastUpdateTime) / 1000;
    dt = Math.min(dt, 0.016666);
    this.lastUpdateTime = now;
    return dt;
  }

  updateColors(dt) {
    this.colorUpdateTimer += dt * this.config.COLOR_UPDATE_SPEED;
    if (this.colorUpdateTimer >= 1) {
      this.colorUpdateTimer = this.wrap(this.colorUpdateTimer, 0, 1);
      this.pointers.forEach(p => {
        p.color = this.generateColor();
      });
    }
  }

  applyInputs() {
    if (window.controlMode === 'gesture' && window.gestureController && window.gestureController.active) {
      const coords = window.gestureController.updateSmoothCoords();
      let pointer = this.pointers[0];
      if (coords.visible) {
        const posX = coords.x * this.canvas.width;
        const posY = coords.y * this.canvas.height;
        
        if (!pointer.down) {
          pointer.down = true;
          pointer.texcoordX = coords.x;
          pointer.texcoordY = 1.0 - coords.y;
          pointer.prevTexcoordX = pointer.texcoordX;
          pointer.prevTexcoordY = pointer.prevTexcoordY;
          pointer.color = this.generateColor();
        }
        
        this.updatePointerMoveData(pointer, posX, posY, pointer.color);
        
        if (pointer.moved) {
          pointer.moved = false;
          this.splatPointer(pointer);
        }
      } else {
        pointer.down = false;
      }
    } else {
      this.pointers.forEach(p => {
        if (p.moved) {
          p.moved = false;
          this.splatPointer(p);
        }
      });
    }
  }

  step(dt) {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    
    this.curlProgram.bind();
    gl.uniform2f(this.curlProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.curlProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    this.blit(this.curl);

    this.vorticityProgram.bind();
    gl.uniform2f(this.vorticityProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.vorticityProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(this.vorticityProgram.uniforms.uCurl, this.curl.attach(1));
    gl.uniform1f(this.vorticityProgram.uniforms.curl, this.config.CURL);
    gl.uniform1f(this.vorticityProgram.uniforms.dt, dt);
    this.blit(this.velocity.write);
    this.velocity.swap();

    this.divergenceProgram.bind();
    gl.uniform2f(this.divergenceProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.divergenceProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    this.blit(this.divergence);

    this.clearProgram.bind();
    gl.uniform1i(this.clearProgram.uniforms.uTexture, this.pressure.read.attach(0));
    gl.uniform1f(this.clearProgram.uniforms.value, this.config.PRESSURE);
    this.blit(this.pressure.write);
    this.pressure.swap();

    this.pressureProgram.bind();
    gl.uniform2f(this.pressureProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.pressureProgram.uniforms.uDivergence, this.divergence.attach(0));
    for (let i = 0; i < this.config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(this.pressureProgram.uniforms.uPressure, this.pressure.read.attach(1));
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    this.gradienSubtractProgram.bind();
    gl.uniform2f(this.gradienSubtractProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(this.gradienSubtractProgram.uniforms.uPressure, this.pressure.read.attach(0));
    gl.uniform1i(this.gradienSubtractProgram.uniforms.uVelocity, this.velocity.read.attach(1));
    this.blit(this.velocity.write);
    this.velocity.swap();

    this.advectionProgram.bind();
    gl.uniform2f(this.advectionProgram.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    if (!this.ext.supportLinearFiltering)
      gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    let velocityId = this.velocity.read.attach(0);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, velocityId);
    gl.uniform1i(this.advectionProgram.uniforms.uSource, velocityId);
    gl.uniform1f(this.advectionProgram.uniforms.dt, dt);
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, this.config.VELOCITY_DISSIPATION);
    this.blit(this.velocity.write);
    this.velocity.swap();

    if (!this.ext.supportLinearFiltering)
      gl.uniform2f(this.advectionProgram.uniforms.dyeTexelSize, this.dye.texelSizeX, this.dye.texelSizeY);
    gl.uniform1i(this.advectionProgram.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(this.advectionProgram.uniforms.uSource, this.dye.read.attach(1));
    gl.uniform1f(this.advectionProgram.uniforms.dissipation, this.config.DENSITY_DISSIPATION);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  render(target) {
    const gl = this.gl;
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    this.drawDisplay(target);
  }

  drawDisplay(target) {
    const gl = this.gl;
    let width = target == null ? gl.drawingBufferWidth : target.width;
    let height = target == null ? gl.drawingBufferHeight : target.height;
    this.displayMaterial.bind();
    if (this.config.SHADING) gl.uniform2f(this.displayMaterial.uniforms.texelSize, 1.0 / width, 1.0 / height);
    gl.uniform1i(this.displayMaterial.uniforms.uTexture, this.dye.read.attach(0));
    this.blit(target, true);
  }

  splatPointer(pointer) {
    let dx = pointer.deltaX * this.config.SPLAT_FORCE;
    let dy = pointer.deltaY * this.config.SPLAT_FORCE;
    this.splat(pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color);
  }

  clickSplat(pointer) {
    const color = this.generateColor();
    color.r *= 10.0;
    color.g *= 10.0;
    color.b *= 10.0;
    let dx = 10 * (Math.random() - 0.5);
    let dy = 30 * (Math.random() - 0.5);
    this.splat(pointer.texcoordX, pointer.texcoordY, dx, dy, color);
  }

  splat(x, y, dx, dy, color) {
    const gl = this.gl;
    this.splatProgram.bind();
    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.velocity.read.attach(0));
    gl.uniform1f(this.splatProgram.uniforms.aspectRatio, this.canvas.width / this.canvas.height);
    gl.uniform2f(this.splatProgram.uniforms.point, x, y);
    gl.uniform3f(this.splatProgram.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(this.splatProgram.uniforms.radius, this.correctRadius(this.config.SPLAT_RADIUS / 100.0));
    this.blit(this.velocity.write);
    this.velocity.swap();

    gl.uniform1i(this.splatProgram.uniforms.uTarget, this.dye.read.attach(0));
    gl.uniform3f(this.splatProgram.uniforms.color, color.r, color.g, color.b);
    this.blit(this.dye.write);
    this.dye.swap();
  }

  correctRadius(radius) {
    let aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio > 1) radius *= aspectRatio;
    return radius;
  }

  updatePointerDownData(pointer, id, posX, posY) {
    pointer.id = id;
    pointer.down = true;
    pointer.moved = false;
    pointer.texcoordX = posX / this.canvas.width;
    pointer.texcoordY = 1.0 - posY / this.canvas.height;
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.deltaX = 0;
    pointer.deltaY = 0;
    pointer.color = this.generateColor();
  }

  updatePointerMoveData(pointer, posX, posY, color) {
    pointer.prevTexcoordX = pointer.texcoordX;
    pointer.prevTexcoordY = pointer.texcoordY;
    pointer.texcoordX = posX / this.canvas.width;
    pointer.texcoordY = 1.0 - posY / this.canvas.height;
    pointer.deltaX = this.correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX);
    pointer.deltaY = this.correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY);
    pointer.moved = Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0;
    pointer.color = color;
  }

  updatePointerUpData(pointer) {
    pointer.down = false;
  }

  correctDeltaX(delta) {
    let aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio < 1) delta *= aspectRatio;
    return delta;
  }

  correctDeltaY(delta) {
    let aspectRatio = this.canvas.width / this.canvas.height;
    if (aspectRatio > 1) delta /= aspectRatio;
    return delta;
  }

  hexToRGB(hex) {
    let val = hex.replace('#', '');
    if (val.length === 3) val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2];
    const r = parseInt(val.slice(0, 2), 16) / 255;
    const g = parseInt(val.slice(2, 4), 16) / 255;
    const b = parseInt(val.slice(4, 6), 16) / 255;
    return { r: r * 0.15, g: g * 0.15, b: b * 0.15 };
  }

  generateColor() {
    if (!this.config.RAINBOW_MODE) {
      return this.hexToRGB(this.config.COLOR);
    }
    let c = this.HSVtoRGB(Math.random(), 1.0, 1.0);
    c.r *= 0.15;
    c.g *= 0.15;
    c.b *= 0.15;
    return c;
  }

  HSVtoRGB(h, s, v) {
    let r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0:
        r = v; g = t; b = p; break;
      case 1:
        r = q; g = v; b = p; break;
      case 2:
        r = p; g = v; b = t; break;
      case 3:
        r = p; g = q; b = v; break;
      case 4:
        r = t; g = p; b = v; break;
      case 5:
        r = v; g = p; b = q; break;
      default:
        break;
    }
    return { r, g, b };
  }

  wrap(value, min, max) {
    const range = max - min;
    if (range === 0) return min;
    return ((value - min) % range) + min;
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

// Initialize Telemetry and Ribbon/Fluid Applications
document.addEventListener('DOMContentLoaded', () => {
  new SpaceBackground();
  new TelemetrySystem();
  
  // Instantiate ribbons first (lazy initialize fluidApp on demand)
  window.ribbonApp = new RibbonApp();
  window.fluidApp = null;

  // Control Mode switching logic
  const modeButtons = document.querySelectorAll('.control-mode-btn');
  window.controlMode = 'mouse';
  window.gestureController = new GestureController();

  modeButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.getAttribute('data-mode');
      window.controlMode = mode;

      const previewGroup = document.querySelector('.camera-preview-group');

      if (mode === 'gesture') {
        if (previewGroup) previewGroup.style.display = 'block';
        window.gestureController.start();
      } else {
        if (previewGroup) previewGroup.style.display = 'none';
        window.gestureController.stop();
      }
    });
  });

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

  // Effect switching logic
  const effectButtons = document.querySelectorAll('.effect-btn');
  const ribbonCanvasContainer = document.getElementById('canvas-container');
  const fluidCanvas = document.getElementById('fluid-canvas');
  const ribbonSettings = document.getElementById('ribbon-settings');
  const fluidSettings = document.getElementById('fluid-settings');

  effectButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      effectButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const effect = btn.getAttribute('data-effect');

      if (effect === 'ribbons') {
        // Switch views
        ribbonCanvasContainer.style.display = 'block';
        fluidCanvas.style.display = 'none';
        
        // Switch settings panel
        ribbonSettings.style.display = 'grid';
        fluidSettings.style.display = 'none';

        // Pause/Resume loop handlers
        if (window.fluidApp) window.fluidApp.pause();
        window.ribbonApp.resume();
      } else {
        // Switch views
        ribbonCanvasContainer.style.display = 'none';
        fluidCanvas.style.display = 'block';

        // Switch settings panel
        ribbonSettings.style.display = 'none';
        fluidSettings.style.display = 'grid';

        // Lazy initialize fluidApp when clicked for the first time
        if (!window.fluidApp) {
          window.fluidApp = new FluidApp();
        }

        // Pause/Resume loop handlers
        window.ribbonApp.pause();
        window.fluidApp.resume();
      }
    });
  });
});
