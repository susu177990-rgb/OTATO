# OTATO 土豆生图

> AI 生图应用，支持 Web 与 Electron 桌面端。多模型、多 API 提供商，本地优先存储。

[![License](https://img.shields.io/badge/license-Private-red.svg)](LICENSE)

---

## 功能特性

| 功能 | 说明 |
|------|------|
| **多模型支持** | Gemini 3 Pro / 3.1 Flash、Nano Banana 系列等 |
| **双 API 提供商** | Gemini Negative（老张）、Grsai Nano Banana |
| **参考图生图** | 支持上传/粘贴参考图，图生图、编辑 |
| **比例与画质** | 1:1 / 3:4 / 4:3 / 9:16 / 16:9，1K / 2K / 4K |
| **图库管理** | 缩略图网格、点击放大查看原图、单张/批量导出 ZIP |
| **智能存储** | Electron 原图+1K 缩略图分存，按需加载；浏览器用 IndexedDB |
| **桌面应用** | Electron 打包，支持 macOS / Windows |

---

## 技术栈

- **前端**: React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **桌面**: Electron 40 + electron-builder
- **存储**: idb-keyval、localStorage
- **导出**: JSZip

---

## 快速开始

### 环境要求

- Node.js 18+

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/susu177990-rgb/OTATO.git
cd OTATO

# 安装依赖
npm install

# Web 开发模式（默认 http://localhost:3001）
npm run dev

# Electron 桌面开发
npm run electron:dev
```

### 构建产物

```bash
# macOS（输出 DMG）
npm run dist

# Windows（输出 portable + zip）
npm run dist:win
```

---

## 配置说明

**无需环境变量**。所有配置在应用内 **配置中心** 完成。

### API 提供商

| 提供商 | 说明 | 默认 Endpoint |
|--------|------|---------------|
| **Gemini Negative** | 老张 API，支持 Gemini、Nano Banana 2 | 需自行填写 |
| **Grsai Nano Banana** | Grsai 接口，Nano Banana 系列 | `https://grsai.dakka.com.cn` |

### 配置项

- **API Endpoint**：接口地址
- **API Key**：你的 API 密钥
- **模型**：预设或手动输入模型名

配置保存在浏览器本地（localStorage + IndexedDB），不会上传到任何服务器。

### 存储策略

| 环境 | 原图 | 缩略图 | 说明 |
|------|------|--------|------|
| **Electron** | `userData/gallery/*.png` | `*_thumb.png`（1K） | 按需加载原图，图库展示缩略图 |
| **浏览器** | IndexedDB | 同存 | 缩略图用于网格，点击放大显示原图 |

图库支持点击图片放大查看（lightbox）、下载原图、批量导出 ZIP。

---

## 项目结构

```
OTATO/
├── components/       # React 组件
│   ├── Generator.tsx # 生图主界面
│   ├── Gallery.tsx   # 图库（缩略图、lightbox、导出）
│   └── Settings.tsx  # 配置中心
├── services/         # 业务逻辑
│   ├── geminiService.ts  # 生图 API 调用
│   └── imageStorage.ts   # 图片持久化（原图/缩略图分存）
├── utils/
│   ├── imageUtils.ts     # 缩略图生成
│   └── errorUtils.ts
├── api路线报告.txt   # 双 API 路线、路由决策、接口说明
├── main.cjs          # Electron 主进程
├── preload.cjs       # Electron 预加载
└── vite.config.ts
```

---

## 部署

可部署到 **Zeabur**、**Vercel**、**Netlify** 等平台。

- 选择 **Static Site** 或 **Vite** 模板
- 构建命令：`npm run build`
- 输出目录：`dist`
- **无需配置环境变量**

---

## 合规声明

- [新ICP备2024016754号-2](https://beian.miit.gov.cn/)
- 本站 API 仅限合规技术研发及学术测试使用
- 用户须严格遵守《生成式人工智能服务管理暂行办法》
- 严禁利用本平台接口生成或传播违法违规内容

---

## License

Private
