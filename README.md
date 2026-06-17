# Z-LAB WebGL 航天遥测交互粒子面板

本项目是一个基于 WebGL 的高性能双特效鼠标交互页面。界面采用 SpaceX 风格的航天科幻极简主义（Aero-Telemetry HUD）设计，支持 **Ribbons (OGL 缎带跟随)** 与 **Fluids (原生 WebGL 雅可比流体模拟)** 两种粒子特效的实时平滑切换、独立参数配置，以及全端自适应的玻璃拟态控制台。

---

## 🚀 核心特性

* **双特效解耦与独立控制**：集成 OGL 缎带和雅可比流体模拟两种截然不同的鼠标跟随效果，并提供完全隔离的参数调节面板。
* **智能节能渲染**：实时监控特效显隐状态。未激活的特效会自动暂停其 `requestAnimationFrame` 渲染循环，最小化 GPU 占用，防止发热。
* **物理级参数转换**：增开 `PARTICLES TIME (秒)` 控制滑块，后台通过反比例转换公式，完美计算对应的 WebGL 指数级消散系数。
* **清屏防残留机制**：采用最终帧清屏 blit 参数，完美解决多重 WebGL 混合在透明 Canvas 上的像素堆积及不消失 Bug。
* **极致科幻 HUD 设计**：等宽大写宇航风格数字（Share Tech Mono）、对称居中的响应式配置网格、扁平胶囊状控制开关以及流畅的 Bezier 折叠面板过渡动画。
* **多端截图与重置**：支持基于活跃画布的视口截图（CAPTURE SCAN）及一键出厂默认重置（RESET ENGINE）。

---

## 📂 项目结构

```text
Particels1/
├── assets/
│   └── space_bg.png          # 悬浮星尘背景纹理
├── index.html                # 页面骨架与科幻 HUD 布局
├── styles.css                # SpaceX 风格样式与自适应网格
├── app.js                    # 三维星空背景、OGL缎带及雅可比流体模拟逻辑
├── webgl_effects_replication_guide.md # 详细的双特效复现与物理着色器设计方案
└── README.md                 # 项目使用说明
```

---

## 🛠️ 快速开始

### 1. 本地预览
项目基于纯 ES Modules 编写，引入了通过 CDN 加载的依赖包（如 OGL, Three.js）。请使用静态服务器启动以防本地 CORS 跨域问题：

```bash
# 使用 npm 安装并运行静态服务器
npx http-server -p 8080
```

打开浏览器访问 `http://localhost:8080` 即可启动交互面板。

### 2. 双特效切换与参数联动
* **RIBBONS 特效**：可通过滑块实时调整缎带条数、基础宽度、跟随延迟（SPEED）和拖尾生命周期，支持正弦波蠕动和淡出。
* **FLUIDS 特效**：可通过滑块实时调节流体涡度（CURL）、溅射半径、流动时长（VELOCITY DISSIPATION）和粒子消散时间（PARTICLES TIME）。支持彩虹模式切换及 3D 油彩法线着色（SHADING）。

---

## 💡 特效复现与实施方案

关于如何在其他项目复现这两种特效，或是对流体模拟的泊松方程、平流着色器源码以及 WebGL 混合机制有复现需求，请直接参考本项目根目录下的详细指南：
👉 **[WebGL 特效复现与着色器实施方案](webgl_effects_replication_guide.md)**
