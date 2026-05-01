import { ProtocolConfig, ApiConfig, AspectRatioType } from '../types';

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

const isGptImageModel = (modelName: string): boolean => /^gpt-image-/i.test(modelName);

const getOpenAIImageQuality = (imageSize: ProtocolConfig['imageSize']): 'low' | 'medium' | 'high' =>
  imageSize === '4K' ? 'high' : imageSize === '2K' ? 'medium' : 'low';

const roundToMultipleOf16 = (value: number): number => Math.max(16, Math.round(value / 16) * 16);

const GPT_IMAGE_SIZE_BY_RATIO: Record<Exclude<AspectRatioType, 'auto'>, Record<ProtocolConfig['imageSize'], string>> = {
  '1:1': { '1K': '1024x1024', '2K': '2048x2048', '4K': '2880x2880' },
  '2:3': { '1K': '1024x1536', '2K': '1360x2048', '4K': '2352x3520' },
  '3:2': { '1K': '1536x1024', '2K': '2048x1360', '4K': '3520x2352' },
  '3:4': { '1K': '1152x1536', '2K': '1536x2048', '4K': '2480x3312' },
  '4:3': { '1K': '1536x1152', '2K': '2048x1536', '4K': '3312x2480' },
  '9:16': { '1K': '864x1536', '2K': '1152x2048', '4K': '2160x3840' },
  '16:9': { '1K': '1536x864', '2K': '2048x1152', '4K': '3840x2160' },
  '21:9': { '1K': '1536x656', '2K': '2048x880', '4K': '3840x1648' },
};

const parseAspectRatio = (ratio: AspectRatioType): number | undefined => {
  if (ratio === 'auto') return undefined;
  const match = ratio.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return width / height;
};

const getGptImageSize = (ratio: AspectRatioType, imageSize: ProtocolConfig['imageSize']): string => {
  const normalizedRatio = ratio === 'auto' ? '1:1' : ratio;
  const configuredSize = GPT_IMAGE_SIZE_BY_RATIO[normalizedRatio]?.[imageSize];
  if (configuredSize) return configuredSize;

  const aspectRatio = parseAspectRatio(normalizedRatio) || 1;
  const longToShortRatio = Math.max(aspectRatio, 1 / aspectRatio);
  if (longToShortRatio > 3) {
    throw new Error(`gpt-image-2 不支持超过 3:1 的极端比例：${ratio}`);
  }

  const longEdgeBySize = imageSize === '4K' ? 3840 : imageSize === '2K' ? 2048 : normalizedRatio === '1:1' ? 1024 : 1536;
  let width: number;
  let height: number;

  if (aspectRatio >= 1) {
    width = longEdgeBySize;
    height = roundToMultipleOf16(longEdgeBySize / aspectRatio);
  } else {
    width = roundToMultipleOf16(longEdgeBySize * aspectRatio);
    height = longEdgeBySize;
  }

  const maxPixels = imageSize === '4K' ? 8294400 : imageSize === '2K' ? 4194304 : 2359296;
  while (width * height > maxPixels) {
    width = Math.max(16, Math.floor(width * 0.98 / 16) * 16);
    height = Math.max(16, Math.floor(height * 0.98 / 16) * 16);
  }

  return `${width}x${height}`;
};

const getOpenAIImageSize = (ratio: AspectRatioType, imageSize: ProtocolConfig['imageSize'], modelName: string): string => {
  const normalizedRatio = ratio === 'auto' ? '1:1' : ratio;
  if (!/^gpt-image-2$/i.test(modelName)) {
    if (normalizedRatio === '16:9' || normalizedRatio === '4:3' || normalizedRatio === '3:2' || normalizedRatio === '21:9') return '1536x1024';
    if (normalizedRatio === '9:16' || normalizedRatio === '3:4' || normalizedRatio === '2:3') return '1024x1536';
    return '1024x1024';
  }

  return getGptImageSize(normalizedRatio, imageSize);
};

const inferProvider = (apiConfig: ApiConfig): ApiConfig['apiProvider'] => {
  const endpointUrl = apiConfig.endpointUrl || '';
  const modelName = apiConfig.modelName || '';
  if (apiConfig.apiProvider === 'grsai-gpt-image' || apiConfig.apiProvider === 'grsai-nano-banana' || apiConfig.apiProvider === 'openai-image') {
    return apiConfig.apiProvider;
  }
  if (endpointUrl.includes('/chat/completions')) return apiConfig.apiProvider || 'laozhang';
  if (endpointUrl.includes('/draw/completions') || (endpointUrl.includes('grsai') && isGptImageModel(modelName))) return 'grsai-gpt-image';
  if (endpointUrl.includes('/draw/nano-banana')) return 'grsai-nano-banana';
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
  
  // 如果端点明确指向了 /images/... 或者是 dall-e 系列，则走原生图像生成（带多模态表单上传）通道
  if (provider === 'openai-image') {
    return generateViaOpenAIImages(apiKey, endpointUrl, modelName, prompt, config, refs);
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

  // 仅在明确是 Google 系模型时，挂靠特有安全与生成配置
  if (modelName.toLowerCase().includes('gemini')) {
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
  apiKey: string, endpointUrl: string, modelName: string, prompt: string, config: ProtocolConfig, refImages: string[] = []
): Promise<string> {
  const size = getOpenAIImageSize(config.aspectRatio, config.imageSize, modelName);
  const quality = getOpenAIImageQuality(config.imageSize);

  if (refImages.length === 0) {
    const payload: Record<string, unknown> = {
      model: modelName,
      prompt,
      n: 1,
      size,
    };
    if (isGptImageModel(modelName)) {
      payload.quality = quality;
      payload.output_format = 'png';
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
  if (isGptImageModel(modelName)) {
    formData.append('quality', quality);
    formData.append('output_format', 'png');
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
const POLL_MAX_ATTEMPTS = 120;

const isGrsaiGptImageEndpoint = (endpointUrl: string, modelName: string): boolean =>
  endpointUrl.includes('/draw/completions') || /^gpt-image-|^sora-image$/i.test(modelName);

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
// endpointUrl 示例：https://api.grsai.com/v1/draw/completions
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

  const useGptImagePayload = provider === 'grsai-gpt-image' || isGrsaiGptImageEndpoint(endpointUrl, modelName);
  const body: Record<string, unknown> = useGptImagePayload
    ? {
        model: modelName,
        prompt,
        size: getGptImageSize(config.aspectRatio, config.imageSize),
        quality: getOpenAIImageQuality(config.imageSize),
        aspectRatio: config.aspectRatio,
        imageSize: config.imageSize,
        variants: 1,
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

  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
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

  throw new Error('生成超时，请稍后重试');
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
