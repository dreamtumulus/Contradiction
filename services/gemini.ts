import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from "@google/genai";
import { AppSettings, AttachedFile } from "../types";

/**
 * Handles communication with Google Gemini API via official SDK
 */
const callGoogleGemini = async (
  prompt: string, 
  files: AttachedFile[], 
  settings: AppSettings, 
  onStream?: (text: string) => void
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: settings.apiKey });
  const parts: any[] = [];

  // Add Files
  for (const file of files) {
    parts.push({
      inlineData: {
        mimeType: file.type,
        data: file.data
      }
    });
  }

  // Add Text Prompt
  parts.push({ text: prompt });

  const modelId = settings.model || 'gemini-3-pro-preview';
  
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  ];

  const model = ai.models;
  
  const result = await model.generateContentStream({
    model: modelId,
    contents: { parts: parts },
    config: {
      systemInstruction: settings.systemInstruction,
      safetySettings: safetySettings,
      maxOutputTokens: 8192, 
      thinkingConfig: modelId.includes('gemini-2.5') ? undefined : { thinkingBudget: 0 }
    }
  });

  let fullText = '';
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
 * Handles communication with OpenAI Compatible APIs (OpenRouter, Local Ollama/vLLM)
 */
const callOpenAICompatible = async (
  prompt: string, 
  files: AttachedFile[], 
  settings: AppSettings, 
  onStream?: (text: string) => void
): Promise<string> => {
  const baseUrl = settings.baseUrl || (settings.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'http://localhost:11434/v1');
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  
  const messages: any[] = [];

  // System Prompt
  if (settings.systemInstruction) {
    messages.push({ role: 'system', content: settings.systemInstruction });
  }

  // Build User Content
  const userContent: any[] = [];
  
  // 1. Add Text Prompt
  userContent.push({ type: 'text', text: prompt });

  // 2. Process Files
  // OpenAI/OpenRouter typically supports images via URL or Base64. 
  // Text files should be decoded and added as context.
  // PDFs are tricky for standard OpenAI endpoints without a specialized tool, 
  // so we attempt to decode text/* files or warn.
  
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${file.type};base64,${file.data}`
        }
      });
    } else if (file.type === 'text/plain' || file.type === 'text/markdown' || file.type === 'application/json') {
      try {
        const decodedText = atob(file.data);
        userContent.push({
          type: 'text',
          text: `\n\n--- FILE START: ${file.name} ---\n${decodedText}\n--- FILE END ---\n`
        });
      } catch (e) {
        console.warn('Failed to decode text file', file.name);
      }
    } else {
      // For PDFs or others in OpenAI mode, we can't easily send raw bytes unless the specific provider supports it.
      // We'll append a warning to the prompt.
      userContent.push({
        type: 'text',
        text: `\n[系统提示: 文件 ${file.name} (${file.type}) 已上传，但当前使用的 OpenAI 兼容模式可能不支持原生解析此格式（除非是图片或纯文本）。如果模型回答无法读取文件，请尝试使用 Google Gemini 模式或将文件转换为纯文本。]`
      });
    }
  }

  messages.push({ role: 'user', content: userContent });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${settings.apiKey}`
  };

  // OpenRouter specific headers
  if (settings.provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'AuditAI';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model || 'qwen2.5:14b',
      messages: messages,
      stream: true,
      max_tokens: 8192,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Provider Error (${response.status}): ${err}`);
  }

  if (!response.body) throw new Error("No response body");

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
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      
      const dataStr = trimmed.slice(6);
      if (dataStr === '[DONE]') continue;

      try {
        const json = JSON.parse(dataStr);
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

export const generateCaseAnalysis = async (
  prompt: string,
  files: AttachedFile[],
  settings: AppSettings,
  onStream?: (text: string) => void
): Promise<string> => {
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
    if (error.message?.includes('413')) {
      throw new Error("文件过大，超过了当前API的直接处理限制。建议分割文件或提取文本后上传。");
    }
    throw error;
  }
};
