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

export const generateImage = async (
  config: ProtocolConfig,
  apiConfig: ApiConfig,
  refImages: string[] = []
): Promise<string> => {
  const apiKey = apiConfig?.apiKey || '';
  let baseUrl = apiConfig?.baseUrl || '';
  const modelName = apiConfig?.modelName;
  const prompt = config.customPrompt || '';

  if (!baseUrl || !modelName || !apiKey) throw new Error("请先在设置中配置 API");
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

  const refs = await Promise.all(refImages.map(ensureBase64));

  if (modelName === 'nano-banana-2') {
    return generateViaDallE(apiKey, baseUrl, modelName, prompt, config, refs);
  }
  return generateViaGoogleNative(apiKey, baseUrl, modelName, prompt, config, refs);
};

async function generateViaGoogleNative(
  apiKey: string, baseUrl: string, modelName: string, prompt: string, config: ProtocolConfig, refImages: string[] = []
): Promise<string> {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = cleanBase.includes('/v1beta')
    ? `${cleanBase}/models/${modelName}:generateContent?key=${apiKey}`
    : `${cleanBase}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const parts: any[] = [{ text: prompt }];
  for (const ref of refImages) {
    if (ref.startsWith('data:')) parts.push({ inlineData: { mimeType: getMimeType(ref), data: ref.split(',')[1] } });
  }
  const aspectRatioValue = getApiSupportedRatio(config.aspectRatio);
  const imageConfig: Record<string, any> = { imageSize: config.imageSize };
  if (aspectRatioValue) imageConfig.aspectRatio = aspectRatioValue;

  const payload = {
    contents: [{ parts }],
    safetySettings: SAFETY_SETTINGS,
    generationConfig: { imageConfig }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errBody}`);
  }

  const data = await response.json();

  if (!data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)) {
    return data.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data);
  }

  const part = data.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
  if (!part) throw new Error("未返回图片");
  return `data:image/png;base64,${part.inlineData.data}`;
}

async function generateViaDallE(
  apiKey: string, baseUrl: string, modelName: string, prompt: string, config: ProtocolConfig, refImages: string[] = []
): Promise<string> {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  if (refImages.length === 0) {
    const url = `${cleanBase}/v1/images/generations`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        prompt,
        n: 1,
        image_size: config.imageSize,
      }),
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

  const url = `${cleanBase}/v1/images/edits`;
  const formData = new FormData();
  formData.append('model', modelName);
  formData.append('prompt', prompt);
  formData.append('image_size', config.imageSize);
  formData.append('n', '1');
  refImages.forEach((img, i) => {
    const blob = base64ToBlob(img);
    const ext = blob.type.includes('png') ? 'png' : 'jpg';
    formData.append('image[]', blob, `ref_${i}.${ext}`);
  });

  const response = await fetch(url, {
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
