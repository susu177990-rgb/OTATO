# 土豆生图 App — API 架构报告

> 本文档全面解析项目中与 API 搭建相关的一切，以及比例与画质相关的内容。

---

## 一、API 类型与配置

### 1.1 类型定义 (`types.ts`)

```typescript
export interface ApiConfig {
  baseUrl: string;   // API 基础地址
  apiKey: string;    // API 密钥
  modelName: string; // 模型名称
}
```

### 1.2 默认配置 (`constants.ts`)

| 字段 | 默认值 |
|------|--------|
| baseUrl | `https://api.laozhang.ai` |
| apiKey | `''`（需用户填写） |
| modelName | `gemini-3-pro-image-preview` |

### 1.3 预设模型

| ID | 名称 |
|----|------|
| gemini-3.1-flash-image-preview | Gemini 3.1 Flash |
| gemini-3-pro-image-preview | Gemini 3 Pro (Image) |

---

## 二、核心 API 服务

### 2.1 入口函数 `generateImage` (`services/geminiService.ts`)

- **校验**：`baseUrl`、`modelName`、`apiKey` 必须存在，否则抛出 `"请先在设置中配置 API"`
- **实现**：统一走 **Google Gemini 原生接口** `generateViaGoogleNative`

### 2.2 Google Gemini 接口 (`generateViaGoogleNative`)

| 项目 | 说明 |
|------|------|
| **URL** | `{baseUrl}/v1beta/models/{modelName}:generateContent?key={apiKey}` |
| **方法** | POST |
| **请求头** | `Content-Type: application/json`、`Authorization: Bearer {apiKey}`、`x-goog-api-key: {apiKey}` |
| **请求体** | `contents`（含 prompt 与参考图）、`safetySettings`、`generationConfig`（含 `imageConfig`） |
| **功能** | 支持参考图（inlineData）、比例、画质（1K/2K/4K） |

### 2.3 安全设置

所有 `HARM_CATEGORY_*` 均设为 `BLOCK_NONE`：

- HARM_CATEGORY_HARASSMENT
- HARM_CATEGORY_HATE_SPEECH
- HARM_CATEGORY_SEXUALLY_EXPLICIT
- HARM_CATEGORY_DANGEROUS_CONTENT

---

## 三、比例（Aspect Ratio）

### 3.1 类型定义

```typescript
export type AspectRatioType = 'auto' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
```

### 3.2 API 支持的比例

项目仅保留 API 原生支持的 5 种比例：

| 比例 | 说明 |
|------|------|
| 1:1 | 正方形 |
| 3:4 | 竖版（海报、印刷） |
| 4:3 | 横版（电视、摄影） |
| 9:16 | 竖版（短视频） |
| 16:9 | 横版（宽屏） |

### 3.3 「自适应」的实现

**核心逻辑**（`services/geminiService.ts`）：

```typescript
const getApiSupportedRatio = (ratio: AspectRatioType): string | undefined => {
  if (ratio === 'auto') return undefined;
  return ratio;
};

// 构建 imageConfig 时：
const aspectRatioValue = getApiSupportedRatio(config.aspectRatio);
const imageConfig: Record<string, any> = { imageSize: config.imageSize };
if (aspectRatioValue) imageConfig.aspectRatio = aspectRatioValue;
```

**实现要点**：

| 步骤 | 行为 |
|------|------|
| 1 | `aspectRatio === 'auto'` 时，`getApiSupportedRatio` 返回 `undefined` |
| 2 | `imageConfig` 仅包含 `imageSize` |
| 3 | `if (aspectRatioValue)` 为假，不向 `imageConfig` 添加 `aspectRatio` |
| 4 | 请求体中的 `generationConfig.imageConfig` **不包含** `aspectRatio` 字段 |

**结论**：「自适应」= 不向 API 传递 `aspectRatio` 参数，由后端/模型自行决定输出比例。

### 3.4 请求体示例

**自适应（auto）**：

```json
{
  "generationConfig": {
    "imageConfig": {
      "imageSize": "1K"
    }
  }
}
```

**固定比例（如 16:9）**：

```json
{
  "generationConfig": {
    "imageConfig": {
      "imageSize": "2K",
      "aspectRatio": "16:9"
    }
  }
}
```

### 3.5 UI 默认值

- 默认比例：`auto`（自适应）
- 选项：自适应、1:1、3:4、4:3、9:16、16:9

---

## 四、画质（Image Size）

### 4.1 类型定义

```typescript
export type ImageSizeType = '1K' | '2K' | '4K';
```

### 4.2 选项与默认值

| 选项 | 值 | 默认 |
|------|-----|------|
| 1K | `'1K'` | ✓ |
| 2K | `'2K'` | |
| 4K | `'4K'` | |

### 4.3 传递方式

始终写入 `imageConfig.imageSize`，与比例是否「自适应」无关。

---

## 五、配置持久化

### 5.1 存储位置

| 存储 | 键 | 说明 |
|------|-----|------|
| localStorage | `otato_appSettings` | 优先加载 |
| IndexedDB | `appSettings`（通过 idb-keyval） | 无 localStorage 时使用 |

### 5.2 加载顺序

1. 优先读取 `localStorage.getItem('otato_appSettings')`
2. 若无，则从 IndexedDB 读取 `appSettings`
3. 合并到 `appSettings` 状态

### 5.3 保存逻辑

- 设置变更后约 1 秒写入
- 同时写入 localStorage 和 IndexedDB
- 实时生效，无需刷新

---

## 六、设置界面

### 6.1 配置项

| 配置项 | 字段 | 说明 |
|--------|------|------|
| API Endpoint | baseUrl | 文本输入 |
| API Key | apiKey | 密码输入框，占位符 `sk-...` |
| 模型 | modelName | 预设按钮 + 自定义输入框 |

---

## 七、数据流

```
用户配置 (Settings)
  → apiConfig (baseUrl, apiKey, modelName)
  → App 状态 + localStorage + IndexedDB

用户生图 (Generator)
  → ProtocolConfig (aspectRatio, imageSize, customPrompt)
  → generateImage(config, settings.apiConfig, refImages)
  → geminiService.generateViaGoogleNative
  → fetch 请求 {baseUrl}/v1beta/models/{modelName}:generateContent
  → 返回 base64 图片
  → 存入画廊 (IndexedDB)
```

---

## 八、网络与构建

| 项目 | 说明 |
|------|------|
| 代理 | vite.config.ts 未配置代理，请求直连 baseUrl |
| 开发端口 | 3001 |
| base | `./`（相对路径） |

---

## 九、错误处理

- 统一通过 `getErrorMessage`（`utils/errorUtils.ts`）提取可读错误信息
- API 错误格式：`API 错误 (${status}): ${errBody}`

---

## 十、总结

- **架构**：纯前端应用，无自建后端
- **API**：直接调用用户配置的 baseUrl（Google Gemini 兼容接口）
- **比例**：仅保留 API 支持的 5 种 + 自适应（不传 aspectRatio）
- **画质**：1K / 2K / 4K，始终传递
- **配置**：localStorage + IndexedDB 双写，实时生效
