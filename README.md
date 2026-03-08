# OTATO 土豆生图

AI 生图应用，支持 Web 与 Electron 桌面端。使用 Gemini / DALL·E 等模型生成图片。

## 功能

- 🖼️ AI 生图（支持 Gemini、Nano Banana 等模型）
- 📁 图库管理、批量导出
- ⚙️ 配置中心：API Endpoint、API Key、模型选择
- 💾 本地存储（IndexedDB）

## 运行

**环境要求：** Node.js 18+

```bash
# 安装依赖
npm install

# Web 开发
npm run dev

# Electron 桌面开发
npm run electron:dev
```

## 配置

无需环境变量。首次使用在应用内 **配置中心** 填写：

- **API Endpoint**：接口地址（如 `https://api.laozhang.ai`）
- **API Key**：你的 API 密钥
- **模型**：选择或输入模型名（如 `gemini-3-pro-image-preview`）

## 构建

```bash
# macOS
npm run dist

# Windows
npm run dist:win
```

## 部署

可部署到 Zeabur、Vercel 等平台，无需配置环境变量。

## License

Private
