import { gsap } from 'https://esm.sh/gsap@3.12.2';

const DEFAULT_OPTIONS = {
  cellSize: 10,
  trailRadius: 138,
  fadeDuration: 1.35,
  ease: "power3.out",
};

export class TrailManager {
  constructor(options = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.points = [];
    this.lastPoint = null;
  }

  setOptions(options = {}) {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  addPoint(x, y, { force = false } = {}) {
    const nextPoint = { x, y };

    if (!force && this.lastPoint) {
      const dx = x - this.lastPoint.x;
      const dy = y - this.lastPoint.y;
      const distance = Math.hypot(dx, dy);
      const stepSize = Math.max(4, this.options.cellSize * 0.9);
      const steps = Math.min(10, Math.floor(distance / stepSize));

      for (let step = 1; step <= steps; step += 1) {
        const progress = step / (steps + 1);
        this.spawnPoint(this.lastPoint.x + dx * progress, this.lastPoint.y + dy * progress);
      }
    }

    this.spawnPoint(x, y);
    this.lastPoint = nextPoint;
  }

  spawnPoint(x, y) {
    const point = {
      x,
      y,
      radius: Math.max(2, this.options.cellSize * 0.4),
      alpha: 0.98,
      createdAt: performance.now(),
      tween: null,
    };

    point.tween = gsap.to(point, {
      radius: this.options.trailRadius,
      alpha: 0,
      duration: this.options.fadeDuration,
      ease: this.options.ease,
      overwrite: false,
      onComplete: () => this.removePoint(point),
    });

    this.points.push(point);
  }

  removePoint(point) {
    const index = this.points.indexOf(point);
    if (index !== -1) {
      this.points.splice(index, 1);
    }
  }

  dispose() {
    this.points.forEach((point) => point.tween?.kill());
    this.points = [];
    this.lastPoint = null;
  }
}
