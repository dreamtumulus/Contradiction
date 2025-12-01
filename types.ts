export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  files?: AttachedFile[];
  timestamp: number;
  isError?: boolean;
}

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  data: string; // Base64
}

export type AIProvider = 'google' | 'openrouter' | 'local';

export interface AppSettings {
  provider: AIProvider;
  apiKey: string;
  model: string; // Used for Google models or custom model names
  baseUrl?: string; // For local/proxy/openrouter usage
  systemInstruction?: string;
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export const DEFAULT_SYSTEM_INSTRUCTION = `你是一个专业的法律案件审核专家和矛盾检测系统。
你的任务是审查用户上传的案卷（PDF、文档、笔录等）。
你需要进行以下工作：
1. **矛盾检测**：仔细比对不同笔录、证据之间的时间顺序、内容描述。指出具体的矛盾点（例如：嫌疑人A说早上10点在睡觉，但证人B说早上10点看到他在案发现场）。
2. **时序分析**：梳理案件发生的关键时间线，检查是否有时间上的逻辑漏洞。
3. **程序合规性**：根据一般法律程序，检查笔录、扣押清单等文书是否具备必要的签名、时间等要素（基于文档可见内容）。
4. **生成报告**：输出一份结构清晰的分析报告。

**原则**：
- 必须基于文件内容的真实信息。
- 如果没有发现矛盾或问题，请明确说明“未发现明显矛盾”，严禁捏造或强行查找问题。
- 引用原文来佐证你的发现。
- 保持客观、中立、严谨的语气。`;
