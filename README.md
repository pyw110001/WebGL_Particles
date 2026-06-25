# Z-LAB WebGL 航天遥测交互粒子与 ASCII 面板

本项目是一个基于 WebGL 与 Canvas 2D 的高性能多特效鼠标/手势交互页面。界面采用 SpaceX 风格的航天科幻极简主义（Aero-Telemetry HUD）设计，支持三种核心特效的实时平滑切换、独立参数配置，以及全端自适应的玻璃拟态控制台。

---

## 🚀 核心特性

* **多特效解耦与独立控制**：集成三种截然不同的鼠标/手势跟随跟随效果，提供完全隔离的参数调节面板：
  * **Ribbons (OGL 缎带跟随)**：高性能 WebGL 渐变缎带特效。
  * **Fluids (原生 WebGL 雅可比流体模拟)**：基于泊松方程与雅可比迭代的高仿真流体墨水泼洒效果。
  * **FOTO-ASCII (ASCII 拖尾图像显影)**：支持图片/视频/GIF 帧的像素颜色与亮度采样，鼠标或手势拖拽时局部显现 ASCII 字符画。
* **FOTO-ASCII 特有机制**：
  * **全图自动显隐循环**：首次交互（鼠标或手势触发）后，开启自动 reveal 循环：每轮等待 10s、3s 渐显整张 ASCII 图、保持 5s、再以 3s 渐隐回局部显影状态。在自动显影运行期间，用户的手势/鼠标拖尾可完美与全图背景叠加显示。
  * **本地媒体处理与播放**：支持拖入本地图片直接由前端采样渲染，或拖入视频/GIF 素材，由后台 API 进行多帧提取，并在前端进行流畅的帧循环播放控制。
* **MediaPipe Pose 手势追踪**：
  * **右手绘制**：通过右手腕的空中位移和 LERP 插值，实现无抖动、高连贯的粒子拖拽与 ASCII 轨迹显影效果。
  * **左手切特效（放低手势）**：左手张开且高度低于左肩（高于肘部），悬停 0.25 秒（左手腕处出现蓝色加载进度圈），即可在空中循环切换 RIBBONS/FLUIDS/FOTO-ASCII 三种特效。
  * **左手切配色（高举悬停）**：左手张开高举过肩，悬停 1.0 秒，即循环切换粒子配色，附带亮绿色的加载圆圈进度条动画。
  * **视频镜像预览小窗**：左侧栏折叠式小窗实时镜像显示摄像头画面，对全身主要关节进行靶心追踪。
* **能耗与隐私控制**：切回鼠标模式会自动关闭摄像头，熄灭设备指示灯，最大程度保障隐私与降低电耗。

---

## 📂 项目结构

```text
Particels1/
├── assets/
│   └── space_bg.png          # 悬浮星尘背景纹理 / 默认 ASCII 显影底图
├── server/
│   └── index.js              # 后端 Express API 服务，调用 ffmpeg 对视频/GIF 抽帧
├── src/
│   └── ascii/                # FOTO-ASCII 核心渲染与算法模块 (ES Modules)
│       ├── imageProcessing.js # 像素颜色/亮度采样及 ASCII cells 结构转化
│       ├── renderer.js        # Canvas 2D 字符图层混合重绘
│       ├── trailManager.js    # GSAP 驱动拖尾点淡出插值
│       └── videoProcessing.js # 视频提取 HTTP 接口请求及帧进度控制
├── index.html                # 页面骨架与科幻 HUD 布局
├── styles.css                # SpaceX 风格样式、自适应网格与表单控件样式
├── app.js                    # 遥测主控、三维背景、Ribbon、Fluid 与 ASCII 整合逻辑
├── package.json              # 后端及并发管理依赖配置
├── webgl_effects_replication_guide.md # 双特效复现与流体着色器方案
└── README.md                 # 项目使用说明
```

---

## 🛠️ 快速开始

### 1. 安装依赖
本项目后端视频/GIF 抽帧服务采用 Node.js (Express)，请先在项目根目录下安装依赖包：
```bash
npm install
```
*提示：使用视频/GIF 上传功能需确保您的本机已安装并配置好 `ffmpeg` 工具，且 `ffmpeg` 可以在系统的 `PATH` 环境变量中直接调用。*

### 2. 启动并发服务
运行以下命令，系统将使用 `concurrently` 并发拉起两个本地服务：
* **前端 Web 服务**：`http://localhost:8080`（由 Python HTTP 模块托管）
* **后端抽帧 API**：`http://127.0.0.1:5174`（由 Node.js Express 监听）

```bash
npm run dev
```

打开浏览器访问 `http://localhost:8080` 即可启动航天遥测面板。

### 3. 手势控制体验
* 点击控制面板的 **INPUT MODE** $\to$ **GESTURE** 开启摄像头。
* 用右手在空中遥控指针控制特效，尝试**左手放低张开**，确认特效发生实时循环切换！
* 尝试**左手张开高举过肩**，确认配色发生实时循环切换。
