
// 消息接口定义
export interface Message {
  id: string;                      // 消息唯一标识
  role: 'user' | 'model' | 'system'; // 角色：用户、模型（AI）或系统
  content: string;                 // 消息文本内容
  files?: AttachedFile[];          // 消息附带的文件列表
  timestamp: number;               // 时间戳
  isError?: boolean;               // 标记该消息是否为错误提示
}

// 附件文件接口定义
export interface AttachedFile {
  name: string; // 文件名
  type: string; // MIME类型 (如 application/pdf)
  size: number; // 文件大小 (字节)
  data: string; // Base64 编码的文件数据
}

// 历史会话接口
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

// AI 提供商类型：Google官方、OpenRouter聚合平台、本地模型
export type AIProvider = 'google' | 'openrouter' | 'local';

// 应用设置接口
export interface AppSettings {
  provider: AIProvider;      // 当前选择的 AI 提供商
  apiKey: string;            // API 密钥
  model: string;             // 模型名称 (例如 'gemini-3-pro' 或 'qwen2.5')
  baseUrl?: string;          // API 基础地址 (用于 Local 或 OpenRouter)
  systemInstruction?: string; // 系统提示词 (System Prompt)
}

// 分析状态枚举
export enum AnalysisStatus {
  IDLE = 'IDLE',           // 空闲
  ANALYZING = 'ANALYZING', // 正在分析/生成中
  COMPLETED = 'COMPLETED', // 分析完成
  ERROR = 'ERROR'          // 发生错误
}

// 默认的系统提示词（法律审核专家角色）
export const DEFAULT_SYSTEM_INSTRUCTION = `你是一个专业的法律案件审核专家和矛盾检测系统。
你的任务是审查用户上传的案卷（PDF、Word文档、笔录等）。
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
