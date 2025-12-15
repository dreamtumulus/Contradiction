
import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { AppSettings, AttachedFile } from "../types";

/**
 * 通过官方 SDK 调用 Google Gemini API
 * 适用于：provider 为 'google' 时
 * 优势：原生支持 PDF、视频、音频等多模态输入，上下文窗口大
 */
const callGoogleGemini = async (
  prompt: string, 
  files: AttachedFile[], 
  settings: AppSettings, 
  onStream?: (text: string) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: settings.apiKey });
  const parts: any[] = [];

  // 1. 添加文件部分 (Google GenAI 原生支持 inlineData)
  for (const file of files) {
    parts.push({
      inlineData: {
        mimeType: file.type,
        data: file.data
      }
    });
  }

  // 2. 添加文本提示词
  parts.push({ text: prompt });

  const modelId = settings.model || 'gemini-3-pro-preview';
  
  // 安全设置：仅在高风险时拦截，保证尽可能输出法律分析内容
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  ];

  const model = ai.models;
  
  // 发起流式生成请求
  const result = await model.generateContentStream({
    model: modelId,
    contents: { parts: parts },
    config: {
      systemInstruction: settings.systemInstruction,
      safetySettings: safetySettings,
      maxOutputTokens: 8192, 
      // 如果不是 2.5 系列模型，显式禁用思考预算以避免参数错误
      thinkingConfig: modelId.includes('gemini-2.5') ? undefined : { thinkingBudget: 0 }
    }
  });

  let fullText = '';
  // 处理流式响应块
  for await (const chunk of result) {
    const text = chunk.text;
    if (text) {
      fullText += text;
      if (onStream) onStream(fullText);
    }
  }
  return fullText;
};

/**
 * 调用兼容 OpenAI 格式的 API (OpenRouter, 本地 Ollama/vLLM)
 * 适用于：provider 为 'openrouter' 或 'local' 时
 * 注意：标准 OpenAI 接口通常不直接支持 PDF 上传，需要特殊处理
 */
const callOpenAICompatible = async (
  prompt: string, 
  files: AttachedFile[], 
  settings: AppSettings, 
  onStream?: (text: string) => void
): Promise<string> => {
  // 确定 API 端点
  const baseUrl = settings.baseUrl || (settings.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'http://localhost:11434/v1');
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  
  const messages: any[] = [];

  // 1. 添加系统提示词 (System Prompt)
  if (settings.systemInstruction) {
    messages.push({ role: 'system', content: settings.systemInstruction });
  }

  // 2. 构建用户消息内容 (多模态处理)
  const userContent: any[] = [];
  
  // 添加文本提示
  userContent.push({ type: 'text', text: prompt });

  // 处理文件附件
  // OpenAI/OpenRouter 标准通常支持 Image URL/Base64。
  // 对于文本文件，我们将其解码并作为上下文直接嵌入 Prompt 中。
  // 对于 PDF，标准接口无法直接读取，这里做降级处理或提示。
  
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      // 图片文件：使用 image_url 格式发送 Base64
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.type};base64,${file.data}`
        }
      });
    } else if (file.type === 'text/plain' || file.type === 'text/markdown' || file.type === 'application/json') {
      try {
        // 纯文本类文件：解码 Base64 并嵌入内容
        const decodedText = atob(file.data);
        userContent.push({
          type: 'text',
          text: `\n\n--- FILE START: ${file.name} ---\n${decodedText}\n--- FILE END ---\n`
        });
      } catch (e) {
        console.warn('Failed to decode text file', file.name);
      }
    } else {
      // PDF 或其他二进制文件：提示用户当前模式可能不支持
      userContent.push({
        type: 'text',
        text: `\n[系统提示: 文件 ${file.name} (${file.type}) 已上传，但当前使用的 OpenAI 兼容模式可能不支持原生解析此格式（除非是图片或纯文本）。如果模型回答无法读取文件，请尝试使用 Google Gemini 模式或将文件转换为纯文本。]`
      });
    }
  }

  messages.push({ role: 'user', content: userContent });

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${settings.apiKey}`
  };

  // OpenRouter 特有请求头 (用于统计排名)
  if (settings.provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'AuditAI';
  }

  // 发起 Fetch 请求
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model || 'qwen2.5:14b', // 默认回退模型
      messages: messages,
      stream: true,        // 开启流式传输
      max_tokens: 8192,
      temperature: 0.3     // 较低的温度以保持分析的严谨性
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Provider Error (${response.status}): ${err}`);
  }

  if (!response.body) throw new Error("No response body");

  // 手动解析 SSE (Server-Sent Events) 流
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留未完整的行到下一次循环

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') continue; // 流结束标志

      try {
        const json = JSON.parse(dataStr);
        // 获取增量内容
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          if (onStream) onStream(fullText);
        }
      } catch (e) {
        console.warn('Error parsing stream chunk', e);
      }
    }
  }

  return fullText;
};

/**
 * 生成案件分析的主入口函数
 * 根据设置自动分发到不同的 AI 服务实现
 */
export const generateCaseAnalysis = async (
  prompt: string,
  files: AttachedFile[],
  settings: AppSettings,
  onStream?: (text: string) => void
): Promise<string> => {
  // 校验 API Key (本地模式除外)
  if (!settings.apiKey && settings.provider !== 'local') {
    throw new Error("API Key is missing. Please set it in Settings.");
  }

  try {
    if (settings.provider === 'google') {
      return await callGoogleGemini(prompt, files, settings, onStream);
    } else {
      return await callOpenAICompatible(prompt, files, settings, onStream);
    }
  } catch (error: any) {
    console.error("AI Service Error:", error);
    // 针对常见的大文件错误给出友好提示
    if (error.message?.includes('413')) {
      throw new Error("文件过大，超过了当前API的直接处理限制。建议分割文件或提取文本后上传。");
    }
    throw error;
  }
};
