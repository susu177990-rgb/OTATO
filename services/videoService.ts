import { ProtocolConfig, ApiConfig } from '../types';

const POLL_MAX_ATTEMPTS = 120; // 120次 * 5秒 = 10分钟
const POLL_INTERVAL = 5000;    // 5秒

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const generateVideo = async (
  config: ProtocolConfig & { duration?: number },
  apiConfig: ApiConfig,
  refImages: string[] = []
): Promise<string> => {
  const apiKey = apiConfig?.apiKey || '';
  const endpointUrl = apiConfig?.endpointUrl?.trim() || '';
  const modelName = apiConfig?.modelName;
  const prompt = config.customPrompt || '';

  if (!endpointUrl || !modelName || !apiKey) {
    throw new Error("请先在左侧边栏配置完整的 Video Endpoint URL、模型名和 API Key");
  }

  const payload: any = {
    model: modelName,
    prompt: prompt,
    aspect_ratio: config.aspectRatio === 'auto' ? '16:9' : config.aspectRatio,
  };

  if (config.duration) {
    payload.duration = config.duration;
  }

  // Handle Image-to-Video
  const urls: string[] = refImages.filter(r => r && (r.startsWith('http') || r.startsWith('data:')));
  if (urls.length > 0) {
    payload.images = urls;
  }

  // 1. 提交任务
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

  const initData = await response.json();
  
  const taskId = initData.task_id || initData.data?.task_id || initData.id;
  if (!taskId) {
    throw new Error(initData.msg || initData.error?.message || '未返回任务 ID (task_id)');
  }

  // 2. 轮询结果
  let taskUrl = endpointUrl;
  if (!taskUrl.endsWith('/')) {
    taskUrl += '/';
  }
  taskUrl += taskId;

  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await delay(POLL_INTERVAL);
    
    const taskResp = await fetch(taskUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!taskResp.ok) {
      const errBody = await taskResp.text();
      console.error(`查询失败 status: ${taskResp.status}, body: ${errBody}`);
      // 偶尔请求失败（可能网络抖动），不直接 throw，重试即可
      continue;
    }

    const taskData = await taskResp.json();
    const status = taskData.status?.toUpperCase() || '';

    if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'SUCCEEDED') {
      const output = taskData.data?.output || taskData.data?.url || taskData.video_url;
      if (output) return output;
      // 兼容 outputs 数组情况
      if (taskData.data?.outputs?.[0]) return taskData.data.outputs[0];
      throw new Error(`任务成功，但未解析到视频 URL: ${JSON.stringify(taskData)}`);
    } else if (status === 'FAILED' || status === 'CANCELED') {
      throw new Error(`生成失败: ${taskData.fail_reason || taskData.error || '未知错误'}`);
    }

    // PROCESSING / QUEUED / STARTING 等状态，继续轮询
  }

  throw new Error('视频生成超时: 超过十分钟未能获取结果。');
};
