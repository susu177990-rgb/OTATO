import { ProtocolConfig, ApiConfig } from '../types';

const POLL_MAX_ATTEMPTS = 120; // 120次 * 5秒 = 10分钟
const POLL_INTERVAL = 5000;    // 5秒

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type VideoGenerationConfig = Omit<ProtocolConfig, 'imageSize'> & {
  duration?: number;
  motionImageUrl?: string;
  motionVideoUrl?: string;
  motionVideoName?: string;
  motionMode?: string;
  characterOrientation?: 'image' | 'video';
  keepOriginalSound?: boolean;
};

const isMotionControlRequest = (apiConfig: ApiConfig): boolean =>
  apiConfig?.modelName === 'kling-video-motion-control' ||
  apiConfig?.endpointUrl?.includes('/kling/v1/videos/motion-control') === true;

const isWanAnimateMoveRequest = (apiConfig: ApiConfig): boolean =>
  apiConfig?.modelName === 'wan2.2-animate-move' ||
  apiConfig?.endpointUrl?.includes('/qwen/api/v1/services/aigc/image2video/video-synthesis') === true;

const normalizeMotionImage = (input: string): string => {
  if (!input.startsWith('data:')) return input;
  return input.replace(/^data:[^,]+,/, '');
};

const isDashScopeEndpoint = (endpointUrl: string): boolean => {
  try {
    const { hostname } = new URL(endpointUrl);
    return hostname === 'dashscope.aliyuncs.com' || hostname === 'dashscope-intl.aliyuncs.com';
  } catch {
    return endpointUrl.includes('dashscope.aliyuncs.com') || endpointUrl.includes('dashscope-intl.aliyuncs.com');
  }
};

const sanitizeUploadFileName = (name: string, fallbackExt: string): string => {
  const cleaned = name.replace(/[^\w.-]+/g, '_');
  if (cleaned) return cleaned;
  return `upload.${fallbackExt}`;
};

const getFileExtension = (mimeType: string, fallback = 'bin'): string => {
  const [, subtype = ''] = mimeType.split('/');
  if (!subtype) return fallback;
  return subtype.includes('quicktime') ? 'mov' : subtype.split('+')[0];
};

const dataUrlToFile = (dataUrl: string, fileNamePrefix: string): File => {
  const [header, data] = dataUrl.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const extension = getFileExtension(mimeType, 'jpg');
  const fileName = sanitizeUploadFileName(`${fileNamePrefix}.${extension}`, extension);
  return new File([bytes], fileName, { type: mimeType });
};

const uploadFileToGenericEndpoint = async (
  file: File,
  endpointUrl: string,
  apiKey: string
): Promise<string> => {
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('当前接口的本地上传通道仅支持 20MB 以内文件，请压缩后重试或改用公网 URL。');
  }

  const origin = new URL(endpointUrl).origin;
  const formData = new FormData();
  formData.append('file', file, sanitizeUploadFileName(file.name, getFileExtension(file.type)));

  const response = await fetch(`${origin}/v1/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`本地文件上传失败 (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  if (!data?.url || typeof data.url !== 'string') {
    throw new Error('本地文件上传成功，但未返回可用的文件 URL。');
  }
  return data.url;
};

const uploadFileToDashScope = async (
  file: File,
  endpointUrl: string,
  apiKey: string,
  modelName: string
): Promise<string> => {
  const origin = new URL(endpointUrl).origin;
  const policyResp = await fetch(
    `${origin}/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(modelName)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!policyResp.ok) {
    const errBody = await policyResp.text();
    throw new Error(`获取 DashScope 上传凭证失败 (${policyResp.status}): ${errBody}`);
  }

  const policyData = await policyResp.json();
  const uploadInfo = policyData?.data;
  if (!uploadInfo?.upload_host || !uploadInfo?.upload_dir || !uploadInfo?.policy || !uploadInfo?.signature || !uploadInfo?.oss_access_key_id) {
    throw new Error('获取 DashScope 上传凭证成功，但返回字段不完整。');
  }

  const fileName = sanitizeUploadFileName(file.name, getFileExtension(file.type));
  const key = `${uploadInfo.upload_dir}/${fileName}`;
  const formData = new FormData();
  formData.append('OSSAccessKeyId', uploadInfo.oss_access_key_id);
  formData.append('Signature', uploadInfo.signature);
  formData.append('policy', uploadInfo.policy);
  formData.append('x-oss-object-acl', uploadInfo.x_oss_object_acl);
  formData.append('x-oss-forbid-overwrite', uploadInfo.x_oss_forbid_overwrite);
  formData.append('key', key);
  formData.append('success_action_status', '200');
  formData.append('file', file, fileName);

  const uploadResp = await fetch(uploadInfo.upload_host, {
    method: 'POST',
    body: formData,
  });

  if (!uploadResp.ok) {
    const errBody = await uploadResp.text();
    throw new Error(`上传文件到 DashScope 临时存储失败 (${uploadResp.status}): ${errBody}`);
  }

  return `oss://${key}`;
};

const uploadLocalFile = async (
  file: File,
  endpointUrl: string,
  apiKey: string,
  modelName: string
): Promise<string> => {
  if (isDashScopeEndpoint(endpointUrl)) {
    return uploadFileToDashScope(file, endpointUrl, apiKey, modelName);
  }
  return uploadFileToGenericEndpoint(file, endpointUrl, apiKey);
};

const getTaskStatus = (taskData: any): string =>
  String(
    taskData?.status ||
    taskData?.task_status ||
    taskData?.output?.task_status ||
    taskData?.data?.status ||
    taskData?.data?.task_status ||
    ''
  ).toUpperCase();

const isSuccessStatus = (status: string): boolean =>
  ['SUCCESS', 'COMPLETED', 'SUCCEEDED', 'SUCCEED'].includes(status);

const isFailureStatus = (status: string): boolean =>
  ['FAILED', 'FAIL', 'CANCELED', 'CANCELLED'].includes(status);

const getTaskOutputUrl = (taskData: any): string | null => {
  const candidates = [
    taskData?.data?.output,
    taskData?.data?.url,
    taskData?.video_url,
    taskData?.output?.results?.video_url,
    taskData?.output?.video_url,
    taskData?.data?.task_result?.videos?.[0]?.url,
    taskData?.task_result?.videos?.[0]?.url,
    taskData?.data?.outputs?.[0],
  ];

  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0) || null;
};

const getApiErrorMessage = (data: any, fallback: string): string =>
  data?.msg ||
  data?.message ||
  data?.error?.message ||
  data?.error ||
  data?.data?.task_status_msg ||
  fallback;

const getTaskQueryUrl = (apiConfig: ApiConfig, taskId: string): string => {
  const endpointUrl = apiConfig?.endpointUrl?.trim() || '';
  if (isWanAnimateMoveRequest(apiConfig)) {
    const baseUrl = new URL(endpointUrl);
    return `${baseUrl.origin}/qwen/api/v1/tasks/${taskId}`;
  }

  let taskUrl = endpointUrl;
  if (!taskUrl.endsWith('/')) {
    taskUrl += '/';
  }
  return `${taskUrl}${taskId}`;
};

export interface VideoTaskQueryResult {
  taskId: string;
  status: string;
  outputUrl?: string;
  raw: any;
}

export const queryVideoTask = async (
  taskId: string,
  apiConfig: ApiConfig
): Promise<VideoTaskQueryResult> => {
  const apiKey = apiConfig?.apiKey || '';
  const endpointUrl = apiConfig?.endpointUrl?.trim() || '';

  if (!taskId.trim()) {
    throw new Error('请输入 task_id');
  }
  if (!endpointUrl || !apiKey) {
    throw new Error('请先配置完整的 Video Endpoint URL 和 API Key');
  }

  const taskResp = await fetch(getTaskQueryUrl(apiConfig, taskId.trim()), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!taskResp.ok) {
    const errBody = await taskResp.text();
    throw new Error(`API 错误 (${taskResp.status}): ${errBody}`);
  }

  const taskData = await taskResp.json();
  if (taskData?.code && Number(taskData.code) !== 0) {
    throw new Error(getApiErrorMessage(taskData, '查询任务失败'));
  }

  const status = getTaskStatus(taskData);
  const outputUrl = getTaskOutputUrl(taskData) || undefined;

  return {
    taskId: taskId.trim(),
    status,
    outputUrl,
    raw: taskData,
  };
};

export const generateVideo = async (
  config: VideoGenerationConfig,
  apiConfig: ApiConfig,
  refImages: string[] = [],
  motionVideoFile?: File
): Promise<string> => {
  const apiKey = apiConfig?.apiKey || '';
  const endpointUrl = apiConfig?.endpointUrl?.trim() || '';
  const modelName = apiConfig?.modelName;
  const prompt = config.customPrompt || '';
  const isMotionControl = isMotionControlRequest(apiConfig);
  const isWanAnimateMove = isWanAnimateMoveRequest(apiConfig);

  if (!endpointUrl || !apiKey || (!modelName && !isMotionControl && !isWanAnimateMove)) {
    throw new Error("请先在左侧边栏配置完整的 Video Endpoint URL、模型名和 API Key");
  }

  const firstRefImage = refImages.find(Boolean) || '';
  let resolvedMotionImageUrl = config.motionImageUrl?.trim() || '';
  let resolvedMotionVideoUrl = config.motionVideoUrl?.trim() || '';

  if (motionVideoFile) {
    const uploadModelName = modelName || (isWanAnimateMove ? 'wan2.2-animate-move' : 'kling-video-motion-control');
    resolvedMotionVideoUrl = await uploadLocalFile(motionVideoFile, endpointUrl, apiKey, uploadModelName);
  }

  if (isMotionControl && !resolvedMotionImageUrl) {
    resolvedMotionImageUrl = normalizeMotionImage(firstRefImage);
  }

  if (isWanAnimateMove && !resolvedMotionImageUrl && firstRefImage) {
    resolvedMotionImageUrl = firstRefImage;
  }

  if (isWanAnimateMove && resolvedMotionImageUrl.startsWith('data:')) {
    const uploadModelName = modelName || 'wan2.2-animate-move';
    resolvedMotionImageUrl = await uploadLocalFile(
      dataUrlToFile(resolvedMotionImageUrl, 'motion-image'),
      endpointUrl,
      apiKey,
      uploadModelName
    );
  }

  const payload: any = isMotionControl ? {
    prompt,
    image_url: resolvedMotionImageUrl,
    video_url: resolvedMotionVideoUrl,
    mode: config.motionMode === 'std' ? 'std' : 'pro',
    character_orientation: config.characterOrientation === 'image' ? 'image' : 'video',
  } : isWanAnimateMove ? {
    model: modelName,
    input: {
      image_url: resolvedMotionImageUrl,
      video_url: resolvedMotionVideoUrl,
    },
    parameters: {
      mode: config.motionMode || 'wan-pro',
    }
  } : {
    model: modelName,
    prompt,
    aspect_ratio: config.aspectRatio === 'auto' ? '16:9' : config.aspectRatio,
  };

  if (!isMotionControl && !isWanAnimateMove && config.duration) {
    payload.duration = config.duration;
  }

  if (!isMotionControl && !isWanAnimateMove) {
    const urls: string[] = refImages.filter(r => r && (r.startsWith('http') || r.startsWith('data:')));
    if (urls.length > 0) {
      payload.images = urls;
    }
  }

  // 1. 提交任务
  const needsOssResolve = [resolvedMotionImageUrl, resolvedMotionVideoUrl].some((value) => value?.startsWith('oss://'));
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...(isWanAnimateMove ? { 'X-DashScope-Async': 'enable' } : {}),
      ...(needsOssResolve ? { 'X-DashScope-OssResourceResolve': 'enable' } : {}),
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`API 错误 (${response.status}): ${errBody}`);
  }

  const initData = await response.json();
  if (initData?.code && Number(initData.code) !== 0) {
    throw new Error(getApiErrorMessage(initData, '任务提交失败'));
  }
  
  const taskId = initData.task_id || initData.data?.task_id || initData.output?.task_id || initData.request_id || initData.id;
  if (!taskId) {
    throw new Error(getApiErrorMessage(initData, '未返回任务 ID (task_id)'));
  }
  console.info(`[video] submitted task_id=${taskId}`);

  // 2. 轮询结果
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await delay(POLL_INTERVAL);

    try {
      const result = await queryVideoTask(taskId, apiConfig);
      if (isSuccessStatus(result.status)) {
        if (result.outputUrl) return result.outputUrl;
        throw new Error(`任务成功，但未解析到视频 URL: ${JSON.stringify(result.raw)}`);
      } else if (isFailureStatus(result.status)) {
        throw new Error(`生成失败: ${getApiErrorMessage(result.raw, '未知错误')}`);
      }
    } catch (error) {
      console.error(`查询任务失败 task_id=${taskId}`, error);
      // 偶尔请求失败（可能网络抖动），不直接 throw，重试即可
      continue;
    }

    // PROCESSING / QUEUED / STARTING 等状态，继续轮询
  }

  throw new Error('视频生成超时: 超过十分钟未能获取结果。');
};
