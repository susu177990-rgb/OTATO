# 🥔 OTATO 土豆生图

**OTATO** 是一款现代化的 **AI 图像生成应用**，支持多种图像生成模型，提供流畅的本地优先体验。

**在线体验**: [https://otato.zeabur.app/](https://otato.zeabur.app/)

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)](https://vitejs.dev)

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| **多模型支持** | 支持 Gemini、GPT-Image、DALL-E 等主流图像生成模型 |
| **自定义模型配置** | 可自由添加、切换不同 API 提供商的模型 |
| **参考图生图** | 支持上传/粘贴参考图，实现图生图、风格迁移、局部编辑 |
| **比例与画质** | 多种比例 (1:1 / 3:4 / 4:3 / 9:16 / 16:9) 和画质 (1K / 2K / 4K) 可选 |
| **图库管理** | 缩略图网格展示，点击放大查看原图，支持单张/批量导出 |
| **本地优先存储** | 所有配置和图片存储在本地，保护隐私安全 |
| **跨平台** | 支持 Web 浏览器访问，Electron 桌面端即将推出 |

---

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/susu177990-rgb/OTATO.git
cd OTATO

# 安装依赖
npm install

# Web 开发模式
npm run dev

# 构建生产版本
npm run build
```

### Electron 桌面开发

```bash
npm run electron:dev
```

### 构建桌面安装包

```bash
# macOS (输出 DMG)
npm run dist

# Windows (输出 portable + zip)
npm run dist:win
```

---

## 🔧 配置说明

### 添加自定义模型

1. 点击左侧面板的 **+** 按钮
2. 填写模型信息：
   - **显示名称**: 给模型起个名字
   - **模型名**: API 模型标识符（如 `gpt-image-1`）
   - **API 地址**: API Endpoint URL
   - **API Key**: 密钥（可选）
3. 点击 **保存模型** 即可

配置自动保存到本地存储（localStorage + IndexedDB），不会上传到任何服务器。

### 存储说明

| 环境 | 存储方式 |
|------|---------|
| **Web 浏览器** | IndexedDB 存储图片，localStorage 存储配置 |
| **Electron** | 原图存储在 `userData/gallery/`，缩略图按需加载 |

---

## 🏗️ 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite 6
- **样式**: Tailwind CSS 4
- **桌面**: Electron 40 + electron-builder
- **存储**: idb-keyval、localStorage
- **导出**: JSZip

---

## 📁 项目结构

```
OTATO/
├── components/          # React 组件
│   ├── Generator.tsx    # 生图主界面
│   ├── Gallery.tsx      # 图库管理
│   └── VideoGenerator.tsx # 视频生成
├── services/            # 业务逻辑
│   ├── geminiService.ts # 图像生成 API
│   └── imageStorage.ts  # 图片持久化
├── utils/
│   ├── imageUtils.ts    # 图片处理工具
│   └── errorUtils.ts    # 错误处理
├── types.ts             # TypeScript 类型定义
├── constants.ts         # 常量配置
├── main.cjs             # Electron 主进程
├── preload.cjs          # Electron 预加载脚本
└── vite.config.ts       # Vite 配置
```

---

## 🚀 部署

可部署到 **Zeabur**、**Vercel**、**Netlify**、**Railway** 等平台。

**Zeabur 部署示例：**

1. Fork 本仓库
2. 在 Zeabur 中导入项目
3. 选择 **Web** 服务类型
4. 构建命令: `npm run build`
5. 输出目录: `dist`

**Vercel 部署：**

```bash
npm i -g vercel
vercel --prod
```

---

## 🌐 About

**OTATO 土豆生图** 是一个开源的 AI 图像生成工具，旨在为用户提供简单、高效、本地优先的图像生成体验。

- **官网**: [https://otato.zeabur.app/](https://otato.zeabur.app/)
- **GitHub**: [https://github.com/susu177990-rgb/OTATO](https://github.com/susu177990-rgb/OTATO)

---

## 📜 合规声明

- 本工具仅供技术研究与学习使用
- 用户须严格遵守当地法律法规
- 严禁利用本平台生成或传播违法违规内容
- 禁止使用本工具从事任何违法活动

---

## 📄 License

[MIT License](LICENSE) - 自由使用、修改和分发。

---

<p align="center">
  <strong>Made with ❤️ by the OTATO Team</strong>
</p>