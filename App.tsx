
import React, { useState, useRef, useEffect } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { ChatBubble } from './components/ChatBubble';
import { 
  Message, 
  AppSettings, 
  AttachedFile, 
  DEFAULT_SYSTEM_INSTRUCTION, 
  AnalysisStatus,
  ChatSession
} from './types';
import { fileToBase64, isValidFileType, extractTextFromDocx } from './utils/fileUtils';
import { generateCaseAnalysis } from './services/gemini';

// 默认应用设置
const INITIAL_SETTINGS: AppSettings = {
  provider: 'google',
  apiKey: '',
  model: 'gemini-3-pro-preview',
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION
};

export default function App() {
  // --- 状态管理 ---
  const [messages, setMessages] = useState<Message[]>([]); // 聊天记录
  const [input, setInput] = useState('');                  // 用户输入框内容
  const [files, setFiles] = useState<AttachedFile[]>([]);  // 当前待上传的文件
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE); // 当前AI处理状态
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // 设置弹窗开关
  
  // 历史会话管理
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
      const savedSessions = localStorage.getItem('auditAI_sessions');
      return savedSessions ? JSON.parse(savedSessions) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // --- 设置加载与持久化 ---
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('auditAI_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // 迁移检查
      if (!parsed.provider) {
        return { ...parsed, provider: 'google', model: parsed.model || 'gemini-3-pro-preview' };
      }
      return parsed;
    }
    return INITIAL_SETTINGS;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 当设置变更时，自动保存
  useEffect(() => {
    localStorage.setItem('auditAI_settings', JSON.stringify(settings));
  }, [settings]);

  // 当会话列表变更时，自动保存
  useEffect(() => {
    localStorage.setItem('auditAI_sessions', JSON.stringify(sessions));
  }, [sessions]);

  // 当消息更新时，实时保存到当前会话
  useEffect(() => {
    if (messages.length > 0) {
        if (currentSessionId) {
            // 更新现有会话
            setSessions(prev => prev.map(s => {
                if (s.id === currentSessionId) {
                    return { ...s, messages: messages, updatedAt: Date.now() };
                }
                return s;
            }));
        } else {
            // 如果还没有SessionID，但在消息更新了（例如刚发送第一条消息），创建新会话
            // 这里的逻辑主要由 handleSessionCreate 处理，避免 useEffect 循环依赖
            // 但如果用户直接加载页面有初始消息（暂无此场景），需要处理
        }
    }
    scrollToBottom();
  }, [messages, status]); // 监听 status 确保流式传输时也滚动

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // --- 会话管理逻辑 ---
  const createNewSession = () => {
      setMessages([]);
      setFiles([]);
      setInput('');
      setCurrentSessionId(null);
      setStatus(AnalysisStatus.IDLE);
  };

  const loadSession = (session: ChatSession) => {
      setCurrentSessionId(session.id);
      setMessages(session.messages);
      setFiles([]);
      setStatus(AnalysisStatus.IDLE);
      // 移动端可能需要关闭侧边栏（如果实现了抽屉效果）
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
          createNewSession();
      }
  };

  // --- 文件处理逻辑 ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles: AttachedFile[] = [];
      for (let i = 0; i < event.target.files.length; i++) {
        const file = event.target.files[i];
        
        // 文件类型校验
        if (!isValidFileType(file)) {
          alert(`不支持的文件类型: ${file.name}`);
          continue;
        }
        
        try {
          // Word 文档特殊处理：提取文本
          if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
              try {
                  const text = await extractTextFromDocx(file);
                  // 将其作为纯文本文件处理，但保留原始名称以便识别
                  const base64Content = btoa(unescape(encodeURIComponent(text))); // 编码 UTF-8 文本为 Base64
                  newFiles.push({
                      name: file.name, // 保留 .docx 后缀提示用户来源
                      type: 'text/plain', // 欺骗系统认为是文本，以便统一处理
                      size: file.size,
                      data: base64Content
                  });
              } catch (docxError) {
                  console.error("Docx parsing failed", docxError);
                  alert(`解析 Word 文档失败: ${file.name}`);
              }
          } else {
              // 普通文件处理
              const base64 = await fileToBase64(file);
              newFiles.push({
                name: file.name,
                type: file.type,
                size: file.size,
                data: base64
              });
          }
        } catch (e) {
          console.error("File processing error", e);
        }
      }
      setFiles(prev => [...prev, ...newFiles]);
    }
    // 重置 input value 允许重复上传同名文件
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // --- 提交处理逻辑 ---
  const handleSubmit = async () => {
    if ((!input.trim() && files.length === 0) || status === AnalysisStatus.ANALYZING) return;
    
    if (settings.provider !== 'local' && !settings.apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    // 1. 构建用户消息
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      files: [...files],
      timestamp: Date.now()
    };

    let activeSessionId = currentSessionId;
    let currentMessages = [...messages, newMessage];

    // 如果是新会话，立即创建 Session 对象
    if (!activeSessionId) {
        activeSessionId = Date.now().toString();
        const newSession: ChatSession = {
            id: activeSessionId,
            title: input.slice(0, 30) || (files.length > 0 ? `${files[0].name} 分析` : '新审核任务'),
            messages: currentMessages,
            updatedAt: Date.now()
        };
        setSessions(prev => [newSession, ...prev]);
        setCurrentSessionId(activeSessionId);
    } else {
        // 更新现有会话的标题（如果是第一条消息后的后续交互，保持原标题，或者这里不改标题）
        // 仅在会话列表顶置
        setSessions(prev => {
            const others = prev.filter(s => s.id !== activeSessionId);
            const current = prev.find(s => s.id === activeSessionId);
            if (current) {
                return [{ ...current, messages: currentMessages, updatedAt: Date.now() }, ...others];
            }
            return prev;
        });
    }

    // 2. 更新 UI 状态
    setMessages(currentMessages);
    setInput('');
    setFiles([]);
    setStatus(AnalysisStatus.ANALYZING);

    // 3. 创建 AI 响应占位
    const responseId = (Date.now() + 1).toString();
    const placeholderMessage: Message = {
      id: responseId,
      role: 'model',
      content: '',
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, placeholderMessage]);

    // 4. 调用 AI 服务
    try {
        let streamContent = '';
        await generateCaseAnalysis(
            newMessage.content || "请对以上上传的卷宗文件进行详细的矛盾检测和合规性审核。",
            newMessage.files || [],
            settings,
            (text) => {
                streamContent = text;
                setMessages(prev => prev.map(m => 
                    m.id === responseId ? { ...m, content: text } : m
                ));
            }
        );
        setStatus(AnalysisStatus.COMPLETED);
    } catch (error: any) {
        console.error(error);
        setMessages(prev => prev.map(m => 
            m.id === responseId ? { 
                ...m, 
                content: `Error: ${error.message || '分析过程中发生未知错误'}. 请检查配置。`,
                isError: true 
            } : m
        ));
        setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex h-screen bg-background text-text overflow-hidden font-sans">
      {/* --- 侧边栏 (Sidebar) --- */}
      <div className="hidden md:flex w-64 flex-col bg-[#1E1F20] border-r border-secondary p-4">
        <div className="flex items-center gap-2 mb-8 px-2">
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-white text-lg">
                卷
            </div>
            <h1 className="text-xl font-bold tracking-tight">卷宗分析系统</h1>
        </div>
        
        <button 
            onClick={createNewSession}
            className="flex items-center gap-3 w-full bg-[#2D2E2F] hover:bg-[#3C3D3E] text-sm font-medium py-3 px-4 rounded-full transition-colors mb-6 text-gray-200 shadow-sm border border-transparent hover:border-gray-600"
        >
            <span className="text-xl leading-none">+</span> 新建审核任务
        </button>

        <div className="flex-1 overflow-y-auto pr-1">
            <div className="text-xs font-medium text-gray-500 mb-3 px-2 uppercase tracking-wider">历史记录</div>
            <div className="space-y-1">
                {sessions.map(session => (
                    <div 
                        key={session.id}
                        onClick={() => loadSession(session)}
                        className={`group relative w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-colors cursor-pointer ${
                            currentSessionId === session.id 
                            ? 'bg-[#A8C7FA]/10 text-primary' 
                            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                        }`}
                        title={session.title}
                    >
                        {session.title || '无标题会话'}
                        <button 
                            onClick={(e) => deleteSession(e, session.id)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            ×
                        </button>
                    </div>
                ))}
                {sessions.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-gray-600">
                        暂无历史记录
                    </div>
                )}
            </div>
        </div>

        <div className="mt-auto pt-4 border-t border-secondary">
             <button 
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-gray-300 transition-colors"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                系统设置
            </button>
            <div className="px-3 py-2 text-xs text-gray-600 truncate" title={settings.model}>
                {settings.provider === 'google' ? 'Google' : settings.provider === 'openrouter' ? 'OpenRouter' : 'Local'}: {settings.model}
            </div>
        </div>
      </div>

      {/* --- 主聊天区域 (Main Chat Area) --- */}
      <div className="flex-1 flex flex-col relative bg-[#131314]">
        {/* 移动端顶部栏 */}
        <div className="md:hidden h-14 border-b border-secondary flex items-center px-4 justify-between bg-[#1E1F20]">
             <span className="font-bold">卷宗分析系统</span>
             <div className="flex gap-3">
                 <button onClick={createNewSession} className="p-2 text-gray-400">
                    <span className="text-xl leading-none">+</span>
                 </button>
                 <button onClick={() => setIsSettingsOpen(true)} className="p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                 </button>
             </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 md:p-10 flex flex-col items-center scroll-smooth">
            {messages.length === 0 ? (
                // 空状态欢迎页
                <div className="flex flex-col items-center justify-center h-full text-center max-w-2xl opacity-50 select-none">
                    <div className="w-20 h-20 rounded-2xl bg-[#2D2E2F] flex items-center justify-center mb-6 shadow-xl">
                         <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#A8C7FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    </div>
                    <h2 className="text-2xl font-semibold mb-3 text-gray-200">卷宗分析系统</h2>
                    <p className="text-gray-400 mb-6 leading-relaxed">
                        支持上传 PDF、Word (.docx)、TXT 等格式的卷宗材料。<br/>
                        系统将自动进行矛盾检测、时序梳理及程序合规性分析。
                    </p>
                    <div className="flex gap-2 text-xs">
                        <span className="bg-[#1E1F20] border border-gray-700 px-3 py-1 rounded-full text-gray-400">支持 Word/PDF</span>
                        <span className="bg-[#1E1F20] border border-gray-700 px-3 py-1 rounded-full text-gray-400">
                             当前模式: {settings.provider === 'google' ? 'Google Gemini' : settings.provider === 'openrouter' ? 'OpenRouter' : 'Local'}
                        </span>
                    </div>
                </div>
            ) : (
                // 消息渲染列表
                <div className="w-full max-w-3xl pb-10">
                    {messages.map(m => <ChatBubble key={m.id} message={m} />)}
                    {/* 加载动画 */}
                    {status === AnalysisStatus.ANALYZING && messages[messages.length-1]?.role !== 'model' && (
                        <div className="flex items-center gap-2 text-gray-500 text-sm ml-4 animate-pulse mt-4">
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                            正在分析卷宗内容...
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}
        </div>

        {/* 输入区域 */}
        <div className="w-full bg-[#131314] p-4 flex justify-center z-10">
            <div className="w-full max-w-3xl bg-[#1E1F20] rounded-2xl border border-secondary p-2 shadow-2xl relative transition-all focus-within:ring-1 focus-within:ring-gray-600">
                {/* 待发送文件列表 */}
                {files.length > 0 && (
                    <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto custom-scrollbar">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 bg-[#2D2E2F] text-xs px-2 py-1.5 rounded-md border border-gray-700 whitespace-nowrap animate-fade-in">
                                <span className="max-w-[120px] truncate text-gray-300 font-medium">{f.name}</span>
                                <span className="text-[10px] text-gray-500">{f.type.includes('word') || f.type === 'text/plain' ? 'TXT' : f.type.split('/')[1].toUpperCase()}</span>
                                <button onClick={() => removeFile(i)} className="text-gray-500 hover:text-red-400 ml-1 rounded-full p-0.5 hover:bg-white/10">×</button>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="flex items-end gap-2 px-2">
                    {/* 上传按钮 */}
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors mb-0.5"
                        title="上传卷宗 (PDF, Word, TXT...)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        multiple 
                        accept=".pdf,.txt,.md,.json,.png,.jpg,.jpeg,.docx" 
                        onChange={handleFileUpload}
                    />
                    
                    {/* 文本输入框 */}
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={files.length > 0 ? "输入审核指令，例如：检查证言是否一致..." : "上传卷宗文件(PDF/Word)并开始审核..."}
                        className="flex-1 bg-transparent text-white placeholder-gray-500 p-3 focus:outline-none resize-none max-h-32 min-h-[52px] leading-relaxed"
                        rows={1}
                        style={{ height: 'auto', minHeight: '52px' }}
                    />
                    
                    {/* 发送按钮 */}
                    <button 
                        onClick={handleSubmit}
                        disabled={(!input.trim() && files.length === 0) || status === AnalysisStatus.ANALYZING}
                        className={`p-3 rounded-full mb-1.5 transition-all shadow-md ${
                            (!input.trim() && files.length === 0) || status === AnalysisStatus.ANALYZING
                            ? 'bg-[#2D2E2F] text-gray-600 cursor-not-allowed'
                            : 'bg-white text-black hover:bg-gray-200'
                        }`}
                    >
                        {status === AnalysisStatus.ANALYZING ? (
                             <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        )}
                    </button>
                </div>
                 <div className="text-[10px] text-gray-600 text-center py-1 pb-2 select-none">
                    AI 分析结果仅供参考，请以原始卷宗为准。
                </div>
            </div>
        </div>

        {/* 设置弹窗组件 */}
        <SettingsModal 
            isOpen={isSettingsOpen} 
            onClose={() => setIsSettingsOpen(false)} 
            settings={settings}
            onSave={setSettings}
        />
      </div>
    </div>
  );
}
