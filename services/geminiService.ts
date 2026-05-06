import { ProtocolConfig, ApiConfig, AspectRatioType, GptImageQualityType } from '../types';

const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
];

const getApiSupportedRatio = (ratio: AspectRatioType): string | undefined => {
  if (ratio === 'auto') return undefined;
  return ratio;
};

const getMimeType = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
  return match ? match[1] : 'image/jpeg';
};

export const isImageResult = (url: string): boolean =>
  url.startsWith('data:image') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) || url.startsWith('http');

const ensureBase64 = async (input: string): Promise<string> => {
  if (!input || input.startsWith('data:')) return input;
  if (input.startsWith('http')) {
    try {
      const r = await fetch(input);
      const blob = await r.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (_) { return input; }
  }
  return input;
};

const base64ToBlob = (dataUrl: string): Blob => {
  const [header, data] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mimeType });
};

/** GPT Image：`moderation` 固定为 `"low"`（OpenAI 文档 optional `"low"` | `"auto"`） */
const GPT_IMAGE_MODERATION = 'low' as const;

const isGptImageModel = (modelName: string): boolean => /^gpt-image-/i.test(modelName);

/**
 * BLTCY 等中转：nano-banana / Gemini 图模文档要求 body / FormData 里带 image_size = 1K|2K|4K；
 * 若只传 OpenAI 标准的 size(W×H)，网关可能忽略并始终按 1K 出图。
 */
const prefersProxyImageSizeTier = (modelName: string): boolean => {
  const m = modelName.toLowerCase();
  return /nano-banana/.test(m) || (/gemini/.test(m) && /image/.test(m));
};

/**
 * OpenAI `/v1/images/generations`（及 edits）：两套「标准」与兼容自动识别。
 * - GPT Image：`size`(W×H) + `gpt-image-*` 时附带 quality/output_format/moderation；不传 image_size。
 * - Nano Banana 中转惯例：`size` + 必选 `image_size` = 1K|2K|4K。
 */
function resolveOpenAiImagesParamKind(
  provider: ApiConfig['apiProvider'],
  modelName: string,
): 'nano-banana' | 'gpt-image' {
  if (provider === 'standard-openai-nano-banana') return 'nano-banana';
  if (provider === 'standard-openai-gpt-image') return 'gpt-image';
  return prefersProxyImageSizeTier(modelName) ? 'nano-banana' : 'gpt-image';
}

/** gpt-image-2、gpt-image-2-vip：与 OpenAI 文档相同的自定义 size 约束 */
const usesGptImage2StyleResolution = (modelName: string): boolean =>
  /^gpt-image-2(-vip)?$/i.test(modelName.trim());

const getOpenAIImageQuality = (imageSize: ProtocolConfig['imageSize']): 'low' | 'medium' | 'high' =>
  imageSize === '4K' ? 'high' : imageSize === '2K' ? 'medium' : 'low';

const resolveGptImageQuality = (config: ProtocolConfig): GptImageQualityType =>
  config.imageQuality ?? getOpenAIImageQuality(config.imageSize);

/**
 * 标准输出分辨率（1K/HD、2K/FHD、4K/UHD）：比例与像素为用户给定表；
 * 3:2、2:3 按同档位长边惯例补齐（与 16:9、9:16 同一套推导方式）。
 */
const STANDARD_IMAGE_SIZE_BY_RATIO: Record<
  Exclude<AspectRatioType, 'auto'>,
  Record<ProtocolConfig['imageSize'], string>
> = {
  '1:1': { '1K': '1280x1280', '2K': '1920x1920', '4K': '3840x3840' },
  '3:4': { '1K': '960x1280', '2K': '1440x1920', '4K': '2880x3840' },
  '4:3': { '1K': '1280x960', '2K': '1920x1440', '4K': '3840x2880' },
  '9:16': { '1K': '720x1280', '2K': '1080x1920', '4K': '2160x3840' },
  '16:9': { '1K': '1280x720', '2K': '1920x1080', '4K': '3840x2160' },
  '21:9': { '1K': '1280x549', '2K': '1920x823', '4K': '3840x1646' },
  '3:2': { '1K': '1280x853', '2K': '1920x1280', '4K': '3840x2560' },
  '2:3': { '1K': '853x1280', '2K': '1280x1920', '4K': '2560x3840' },
};

const getGptImageSize = (ratio: Exclude<AspectRatioType, 'auto'>, imageSize: ProtocolConfig['imageSize']): string => {
  const row = STANDARD_IMAGE_SIZE_BY_RATIO[ratio];
  if (!row) throw new Error(`不支持的比例：${ratio}`);
  const wxh = row[imageSize];
  if (!wxh) throw new Error(`不支持的分辨档位：${imageSize}`);
  return wxh;
};

/** OpenAI gpt-image-2：单边 ≤3840、总像素 ≤8294400、两边为 16px 整数倍（文档 Size constraints） */
const GPT_IMAGE_2_MAX_EDGE = 3840;
const GPT_IMAGE_2_MAX_PIXELS = 8_294_400;

const floorToMultipleOf16 = (n: number): number => Math.max(16, Math.floor(n / 16) * 16);

/**
 * 将「理想 WxH」压到 gpt-image-2 合法范围：按比例缩放并向下对齐到 16，避免 UI 表 4K 超标或非整倍短边导致请求失败。
 */
function clampWxHForGptImage2(wxh: string): string {
  const parts = wxh.split('x').map(s => Number(String(s).trim()));
  let w = parts[0];
  let h = parts[1];
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return wxh;

  const maxE0 = Math.max(w, h);
  let s = 1;
  if (maxE0 > GPT_IMAGE_2_MAX_EDGE) s = Math.min(s, GPT_IMAGE_2_MAX_EDGE / maxE0);
  const px0 = w * h;
  if (px0 > GPT_IMAGE_2_MAX_PIXELS) s = Math.min(s, Math.sqrt(GPT_IMAGE_2_MAX_PIXELS / px0));

  if (s < 1 - 1e-12) {
    w = floorToMultipleOf16(w * s);
    h = floorToMultipleOf16(h * s);
  } else {
    w = floorToMultipleOf16(w);
    h = floorToMultipleOf16(h);
  }

  for (let guard = 0; guard < 32; guard++) {
    const maxE = Math.max(w, h);
    const px = w * h;
    if (maxE <= GPT_IMAGE_2_MAX_EDGE && px <= GPT_IMAGE_2_MAX_PIXELS) break;
    const shrink = Math.min(GPT_IMAGE_2_MAX_EDGE / maxE, Math.sqrt(GPT_IMAGE_2_MAX_PIXELS / Math.max(px, 1)), 0.999);
    w = floorToMultipleOf16(w * shrink);
    h = floorToMultipleOf16(h * shrink);
  }

  return `${w}x${h}`;
}

const resolveGptImage2WxH = (ratio: Exclude<AspectRatioType, 'auto'>, imageSize: ProtocolConfig['imageSize']): string =>
  clampWxHForGptImage2(getGptImageSize(ratio, imageSize));

/**
 * Grsai GPT Image 文档：aspectRatio 可为比例字符串或像素 "WxH"（gpt-image-2 / vip 用本应用计算的像素）。
 * 非 gpt-image-2 系模型仅传比例/auto，由服务端解析。
 */
const getGrsaiGptImageAspectRatioParam = (modelName: string, config: ProtocolConfig): string => {
  if (config.aspectRatio === 'auto') return 'auto';
  if (usesGptImage2StyleResolution(modelName)) {
    return resolveGptImage2WxH(config.aspectRatio, config.imageSize);
  }
  if (isGptImageModel(modelName)) {
    return getOpenAIImageSize(config.aspectRatio, config.imageSize, modelName);
  }
  return config.aspectRatio;
};

/**
 * OpenAI Images / 兼容中转（BLTCY nano-banana、gemini 图模等）：须把 UI 的 1K/2K/4K 映射到合法 WxH。
 * 此前非 gpt-image-2 模型固定返回 ~1024 档位，导致选 4K 仍出 1K。
 */
const getOpenAIImageSize = (ratio: AspectRatioType, imageSize: ProtocolConfig['imageSize'], modelName: string): string => {
  /** UI 选「自适应」：不传固定 WxH，由模型根据 prompt 决定（gpt-image / nano-banana 等常见支持 size=auto） */
  if (ratio === 'auto') {
    if (usesGptImage2StyleResolution(modelName) || isGptImageModel(modelName) || prefersProxyImageSizeTier(modelName)) {
      return 'auto';
    }
    if (/dall-e-3/i.test(modelName)) return '1792x1024';
    if (/dall-e-2/i.test(modelName)) return '1024x1024';
    return 'auto';
  }

  if (usesGptImage2StyleResolution(modelName)) {
    return resolveGptImage2WxH(ratio, imageSize);
  }

  // DALL·E 3：官方仅三种尺寸，不按 2K/4K 分档
  if (/dall-e-3/i.test(modelName)) {
    if (ratio === '16:9' || ratio === '4:3' || ratio === '3:2' || ratio === '21:9') return '1792x1024';
    if (ratio === '9:16' || ratio === '3:4' || ratio === '2:3') return '1024x1792';
    return '1024x1024';
  }

  // DALL·E 2：仅正方形 ≤1024
  if (/dall-e-2/i.test(modelName)) {
    return '1024x1024';
  }

  // nano-banana、gemini-*-image*、及其它 Images 兼容接口：与 gpt-image-2 相同档位表
  return getGptImageSize(ratio, imageSize);
};

const inferProvider = (apiConfig: ApiConfig): ApiConfig['apiProvider'] => {
  const endpointUrl = apiConfig.endpointUrl || '';
  const modelName = apiConfig.modelName || '';
  if (
    apiConfig.apiProvider === 'grsai-gpt-image' ||
    apiConfig.apiProvider === 'grsai-nano-banana' ||
    apiConfig.apiProvider === 'openai-image' ||
    apiConfig.apiProvider === 'standard-openai-gpt-image' ||
    apiConfig.apiProvider === 'standard-openai-nano-banana'
  ) {
    return apiConfig.apiProvider;
  }
  if (endpointUrl.includes('/chat/completions')) return apiConfig.apiProvider || 'laozhang';
  // Grsai：nano 专用路径优先；/draw/completions 需按模型区分，避免 nano 误走 GPT 载荷丢失 imageSize
  if (endpointUrl.includes('/draw/nano-banana')) return 'grsai-nano-banana';
  if (endpointUrl.includes('/draw/completions')) {
    return isGptImageModel(modelName) ? 'grsai-gpt-image' : 'grsai-nano-banana';
  }
  if (endpointUrl.includes('grsai') && isGptImageModel(modelName)) return 'grsai-gpt-image';
  if (endpointUrl.includes('/images/') || modelName.includes('dall-e')) return 'openai-image';
  if (apiConfig.apiProvider === 'grsai' || endpointUrl.includes('grsai') || endpointUrl.includes('dakka')) return 'grsai-nano-banana';
  return apiConfig.apiProvider || 'laozhang';
};

export const generateImage = async (
  config: ProtocolConfig,
  apiConfig: ApiConfig,
  refImages: string[] = []
): Promise<string> => {
  const apiKey = apiConfig?.apiKey || '';
  const endpointUrl = apiConfig?.endpointUrl?.trim() || '';
  const modelName = apiConfig?.modelName;
  const prompt = config.customPrompt || '';

  if (!endpointUrl || !modelName || !apiKey) throw new Error("请先在设置中配置完整的 Endpoint URL、模型名和 API Key");

  const refs = await Promise.all(refImages.map(ensureBase64));
  const provider = inferProvider(apiConfig);

  if (provider === 'grsai-gpt-image' || provider === 'grsai-nano-banana' || provider === 'grsai') {
    return generateViaGrsaiDraw(apiKey, endpointUrl, modelName, prompt, config, refs, provider);
  }
  
  if (
    provider === 'openai-image' ||
    provider === 'standard-openai-gpt-image' ||
    provider === 'standard-openai-nano-banana'
  ) {
    return generateViaOpenAIImages(apiKey, endpointUrl, modelName, prompt, config, refs, provider);
  }

  return generateViaOpenAICompatible(apiKey, endpointUrl, modelName, prompt, config, refs);
};

// ────────────────────────────────────────────────────────────────
// OpenAI-compatible /chat/completions（支持 Gemini 中转站等）
// endpointUrl 示例：https://api.bltcy.ai/v1/chat/completions
// ────────────────────────────────────────────────────────────────
async function generateViaOpenAICompatible(
  apiKey: string, endpointUrl: string, modelName: string, prompt: string, config: ProtocolConfig, refImages: string[] = []
): Promise<string> {

  let userContent: any = prompt;
  if (refImages.length > 0) {
    userContent = [{ type: 'text', text: prompt }];
    for (const ref of refImages) {
      if (ref.startsWith('data:')) {
        userContent.push({
          type: 'image_url',
          image_url: { url: ref }
        });
      }
    }
  }

  const aspectRatioValue = getApiSupportedRatio(config.aspectRatio);
  const imageConfig: Record<string, any> = { imageSize: config.imageSize };
  if (aspectRatioValue) imageConfig.aspectRatio = aspectRatioValue;

  const payload: Record<string, any> = {
    model: modelName,
    prompt: prompt, // 部分中转站提取强需该字段
    messages: [{ role: 'user', content: userContent }]
  };

  // Gemini 图模 / nano-banana：挂 generationConfig.imageConfig（含 imageSize 档位）
  const usesGoogleStyleImageConfig =
    modelName.toLowerCase().includes('gemini') || /^nano-banana/i.test(modelName.trim());

  if (usesGoogleStyleImageConfig) {
    payload.safetySettings = SAFETY_SETTINGS;
    payload.generationConfig = { imageConfig };
  }

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errBody}`);
  }

  const data = await response.json();

  // -------------------------------------------------------------
  // 兼容逻辑 A：中转站将请求完美路由至原生 Image 接口，返回标准结构
  // 结构形如 {"data":[{"url":"..."}]}
  // -------------------------------------------------------------
  if (data.data && Array.isArray(data.data) && data.data.length > 0) {
    const imgObj = data.data[0];
    if (imgObj.url) return imgObj.url;
    if (imgObj.b64_json) return `data:image/png;base64,${imgObj.b64_json}`;
  }

  // -------------------------------------------------------------
  // 兼容逻辑 B：标准 Chat Completions (文本/多模态混排返回)
  // -------------------------------------------------------------
  const choice = data.choices?.[0];
  const contentParts = choice?.message?.content;

  if (Array.isArray(contentParts)) {
    for (const part of contentParts) {
      if (part.type === 'image_url' && part.image_url?.url) return part.image_url.url;
      if (part.type === 'image' && part.image_url?.url) return part.image_url.url;
      if (part.type === 'text' && part.text) return part.text;
    }
  }

  // 纯文本回复（如部分代理商将图片当做文本段落或 markdown 返回）
  if (typeof contentParts === 'string') {
    if (contentParts.trim() === '') {
      return `[EMPTY_CONTENT_STRING_DETECTED] 原始返回数据：\n${JSON.stringify(data, null, 2)}`;
    }

    // 尝试提取 Markdown 格式的图片: ![alt](url)
    const mdMatch = contentParts.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (mdMatch && mdMatch[1]) return mdMatch[1];
    
    // 尝试直接提取 URL 链接
    const urlMatch = contentParts.match(/(https?:\/\/[^\s)]+\.(?:png|jpe?g|webp|gif))/i);
    if (urlMatch && urlMatch[1]) return urlMatch[1];

    // 其他以 http 开头的普通文本链接，或者纯字符串
    if (contentParts.trim().startsWith('http')) return contentParts.trim();
    
    return contentParts;
  }

  // 兼容旧 Google Native 格式（部分中转站透传原始结构）
  const nativePart = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (nativePart) return `data:image/png;base64,${nativePart.inlineData.data}`;
  const nativeText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (nativeText) return nativeText;

  return JSON.stringify(data);
}

// ────────────────────────────────────────────────────────────────
// DALL-E / images 接口（用于 nano-banana-2 等）
// endpointUrl 直接填写完整地址，如 https://api.xxx.com/v1/images/generations
// ────────────────────────────────────────────────────────────────
async function generateViaOpenAIImages(
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  prompt: string,
  config: ProtocolConfig,
  refImages: string[] = [],
  imagesProvider?: ApiConfig['apiProvider'],
): Promise<string> {
  const size = getOpenAIImageSize(config.aspectRatio, config.imageSize, modelName);
  const quality = resolveGptImageQuality(config);
  const imagesKind = resolveOpenAiImagesParamKind(imagesProvider, modelName);

  if (refImages.length === 0) {
    const payload: Record<string, unknown> = {
      model: modelName,
      prompt,
      n: 1,
      size,
    };
    if (imagesKind === 'nano-banana') {
      payload.image_size = config.imageSize;
    }
    if (imagesKind === 'gpt-image' && isGptImageModel(modelName)) {
      payload.quality = quality;
      payload.output_format = 'png';
      payload.moderation = GPT_IMAGE_MODERATION;
    }

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`API 错误 (${response.status}): ${errBody}`);
    }
    const data = await response.json();
    const item = data.data?.[0];
    if (!item) throw new Error("未返回图片");
    if (item.url) return item.url;
    if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
    throw new Error("响应格式异常");
  }

  // 有参考图时走 edits，将 /generations 替换为 /edits
  const editsUrl = endpointUrl.replace('/generations', '/edits');
  const formData = new FormData();
  formData.append('model', modelName);
  formData.append('prompt', prompt);
  formData.append('size', size);
  formData.append('n', '1');
  if (imagesKind === 'nano-banana') {
    formData.append('image_size', config.imageSize);
  }
  if (imagesKind === 'gpt-image' && isGptImageModel(modelName)) {
    formData.append('quality', quality);
    formData.append('output_format', 'png');
    formData.append('moderation', GPT_IMAGE_MODERATION);
  }
  refImages.forEach((img, i) => {
    const blob = base64ToBlob(img);
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    formData.append('image[]', blob, `ref_${i}.${ext}`);
  });

  const response = await fetch(editsUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const item = data.data?.[0];
  if (!item) throw new Error("未返回图片");
  if (item.url) return item.url;
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
  throw new Error("响应格式异常");
}

const POLL_INTERVAL_MS = 1500;

const parseGrsaiImageUrl = (data: any): string | undefined => {
  if (!data) return undefined;
  if (typeof data.url === 'string') return data.url;
  if (typeof data.b64_json === 'string') return `data:image/png;base64,${data.b64_json}`;
  if (Array.isArray(data.results) && data.results.length > 0) {
    const first = data.results[0];
    if (typeof first === 'string') return first;
    if (typeof first?.url === 'string') return first.url;
    if (typeof first?.b64_json === 'string') return `data:image/png;base64,${first.b64_json}`;
  }
  if (Array.isArray(data.data) && data.data.length > 0) return parseGrsaiImageUrl(data.data[0]);
  return undefined;
};

const readGrsaiResponse = async (response: Response): Promise<any> => {
  const text = await response.text();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const payloads = lines.length > 0 ? lines : [text.trim()];
  let lastPayload: any;

  for (const line of payloads) {
    const normalized = line.startsWith('data:') ? line.slice(5).trim() : line;
    if (!normalized || normalized === '[DONE]') continue;
    try {
      const parsed = JSON.parse(normalized);
      lastPayload = parsed;
      if (parsed.progress === 100 || parsed.status === 'succeeded' || parsed.data?.status === 'succeeded') {
        return parsed;
      }
    } catch (_) {
      // Non-JSON progress lines are ignored; the API normally emits JSON or SSE JSON.
    }
  }

  return lastPayload;
};

// ────────────────────────────────────────────────────────────────
// Grsai 专属绘图接口（异步轮询）
// GPT Image 文档示例：https://grsai.dakka.com.cn/v1/draw/completions ；webHook="-1" 立即返回 id 后轮询 /v1/draw/result
// ────────────────────────────────────────────────────────────────
async function generateViaGrsaiDraw(
  apiKey: string,
  endpointUrl: string,
  modelName: string,
  prompt: string,
  config: ProtocolConfig,
  refImages: string[] = [],
  provider: ApiConfig['apiProvider'] = 'grsai-nano-banana'
): Promise<string> {

  const urls: string[] = refImages.filter(
    (r) => r && (r.startsWith('http') || r.startsWith('data:'))
  );

  // 仅 GPT Image 走 aspectRatio+quality；nano-banana 等须带 imageSize（不能用 URL 猜载荷）
  const useGptImagePayload = provider === 'grsai-gpt-image';
  const body: Record<string, unknown> = useGptImagePayload
    ? {
        model: modelName,
        prompt,
        aspectRatio: getGrsaiGptImageAspectRatioParam(modelName, config),
        quality: resolveGptImageQuality(config),
        moderation: GPT_IMAGE_MODERATION,
        webHook: '-1',
      }
    : {
        model: modelName,
        prompt,
        aspectRatio: config.aspectRatio,
        imageSize: config.imageSize,
        webHook: '-1',
        shutProgress: true,
      };
  if (urls.length > 0) body.urls = urls;

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errBody}`);
  }

  const initData = await readGrsaiResponse(response);
  const immediateUrl = parseGrsaiImageUrl(initData?.data || initData);
  if (immediateUrl) return ensureBase64(immediateUrl);

  if (typeof initData?.code === 'number' && initData.code !== 0) {
    throw new Error(initData.msg || '未返回任务 ID');
  }

  const taskId = initData?.data?.id || initData?.id || initData?.taskId;
  if (!taskId) throw new Error(initData?.msg || '未返回任务 ID');

  // 轮询地址：将 draw/completions 或 draw/nano-banana 换为 draw/result
  const resultUrl = endpointUrl.replace(/\/draw\/[^/]+$/, '/draw/result');

  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const resultRes = await fetch(resultUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ id: taskId }),
    });

    if (!resultRes.ok) {
      const errBody = await resultRes.text();
      throw new Error(`获取结果失败 (${resultRes.status}): ${errBody}`);
    }

    const resultData = await readGrsaiResponse(resultRes);
    if (resultData.code === -22) throw new Error('任务不存在');
    if (resultData.code !== 0) throw new Error(resultData.msg || '获取结果失败');

    const data = resultData.data || resultData;
    if (data.status === 'failed') {
      const reason = data.failure_reason || data.error || '未知错误';
      if (reason === 'output_moderation') throw new Error('输出违规');
      if (reason === 'input_moderation') throw new Error('输入违规');
      throw new Error(data.error || data.failure_reason || '生成失败');
    }

    const imgUrl = parseGrsaiImageUrl(data);
    if (imgUrl && (!data.status || data.status === 'succeeded')) return ensureBase64(imgUrl);
  }
}

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
};

export const downloadImage = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  } catch (e) {
    console.error("Download failed", e);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    link.click();
  }
};
