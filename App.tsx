import React, { useState, useRef, useEffect } from 'react';
import { SettingsModal } from './components/SettingsModal';
import { ChatBubble } from './components/ChatBubble';
import { 
  Message, 
  AppSettings, 
  AttachedFile, 
  DEFAULT_SYSTEM_INSTRUCTION, 
  AnalysisStatus 
} from './types';
import { fileToBase64, isValidFileType } from './utils/fileUtils';
import { generateCaseAnalysis } from './services/gemini';

const INITIAL_SETTINGS: AppSettings = {
  provider: 'google',
  apiKey: '',
  model: 'gemini-3-pro-preview',
  systemInstruction: DEFAULT_SYSTEM_INSTRUCTION
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Load settings from localStorage with migration support
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('auditAI_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration check: if provider is missing, default to google
      if (!parsed.provider) {
        return { ...parsed, provider: 'google', model: parsed.model || 'gemini-3-pro-preview' };
      }
      return parsed;
    }
    return INITIAL_SETTINGS;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('auditAI_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, status]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles: AttachedFile[] = [];
      for (let i = 0; i < event.target.files.length; i++) {
        const file = event.target.files[i];
        if (!isValidFileType(file)) {
          alert(`不支持的文件类型: ${file.name}`);
          continue;
        }
        // Increase soft limit slightly, but warn about browser performance
        if (file.size > 50 * 1024 * 1024) { 
            alert(`文件 ${file.name} 较大 (>50MB)。浏览器处理可能会卡顿，且非 Google 模式可能不支持大文件。`);
        }
        try {
          const base64 = await fileToBase64(file);
          newFiles.push({
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64
          });
        } catch (e) {
          console.error("File processing error", e);
        }
      }
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if ((!input.trim() && files.length === 0) || status === AnalysisStatus.ANALYZING) return;
    
    // Check key only if not local
    if (settings.provider !== 'local' && !settings.apiKey) {
      setIsSettingsOpen(true);
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      files: [...files],
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, newMessage]);
    setInput('');
    setFiles([]);
    setStatus(AnalysisStatus.ANALYZING);

    // Placeholder for AI response
    const responseId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: responseId,
      role: 'model',
      content: '',
      timestamp: Date.now()
    }]);

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
                content: `Error: ${error.message || '分析过程中发生未知错误'}. 请检查配置 (API Key / Base URL)。`,
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
      {/* Sidebar (Simple Version) */}
      <div className="hidden md:flex w-64 flex-col bg-[#1E1F20] border-r border-secondary p-4">
        <div className="flex items-center gap-2 mb-8 px-2">
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold text-white">
                A
            </div>
            <h1 className="text-xl font-bold tracking-tight">AuditAI</h1>
        </div>
        
        <button 
            onClick={() => setMessages([])}
            className="flex items-center gap-3 w-full bg-[#2D2E2F] hover:bg-[#3C3D3E] text-sm font-medium py-3 px-4 rounded-full transition-colors mb-6 text-gray-200"
        >
            <span className="text-xl leading-none">+</span> 新建审核任务
        </button>

        <div className="flex-1 overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 mb-3 px-2">最近记录</div>
            {/* Mock History */}
            <div className="space-y-1">
                <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-sm truncate text-gray-400">
                    王某某盗窃案卷宗审核
                </button>
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative">
        {/* Header Mobile */}
        <div className="md:hidden h-14 border-b border-secondary flex items-center px-4 justify-between bg-[#1E1F20]">
             <span className="font-bold">AuditAI</span>
             <button onClick={() => setIsSettingsOpen(true)} className="p-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
             </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-10 flex flex-col items-center">
            {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center max-w-2xl opacity-50">
                    <div className="w-20 h-20 rounded-2xl bg-[#2D2E2F] flex items-center justify-center mb-6">
                         <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#A8C7FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    </div>
                    <h2 className="text-2xl font-semibold mb-2 text-gray-200">欢迎使用矛盾检测与案件审核系统</h2>
                    <p className="text-gray-400">请上传 PDF、Word 或文本格式的卷宗材料。系统将自动进行矛盾检测、时序梳理及程序合规性分析。</p>
                    <div className="mt-4 text-xs text-gray-600 bg-black/20 px-3 py-1 rounded-full">
                      当前模式: {settings.provider === 'google' ? 'Google Gemini' : settings.provider === 'openrouter' ? 'OpenRouter' : '本地模型 (Local)'}
                    </div>
                </div>
            ) : (
                <div className="w-full max-w-3xl">
                    {messages.map(m => <ChatBubble key={m.id} message={m} />)}
                    {status === AnalysisStatus.ANALYZING && messages[messages.length-1]?.role !== 'model' && (
                        <div className="flex items-center gap-2 text-gray-500 text-sm ml-4 animate-pulse">
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                            正在分析卷宗内容...
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}
        </div>

        {/* Input Area */}
        <div className="w-full bg-[#131314] p-4 flex justify-center">
            <div className="w-full max-w-3xl bg-[#1E1F20] rounded-2xl border border-secondary p-2 shadow-lg relative">
                {files.length > 0 && (
                    <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-2 bg-[#2D2E2F] text-xs px-2 py-1 rounded-md border border-gray-700 whitespace-nowrap">
                                <span className="max-w-[100px] truncate text-gray-300">{f.name}</span>
                                <button onClick={() => removeFile(i)} className="text-gray-500 hover:text-red-400">×</button>
                            </div>
                        ))}
                    </div>
                )}
                
                <div className="flex items-end gap-2 px-2">
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="p-3 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                        title="上传卷宗"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        multiple 
                        accept=".pdf,.txt,.md,.json,.png,.jpg"
                        onChange={handleFileUpload}
                    />
                    
                    <textarea 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={files.length > 0 ? "输入审核指令，例如：检查证言是否一致..." : "上传文件并开始审核..."}
                        className="flex-1 bg-transparent text-white placeholder-gray-500 p-3 focus:outline-none resize-none max-h-32 min-h-[50px]"
                        rows={1}
                        style={{ height: 'auto', minHeight: '50px' }}
                    />
                    
                    <button 
                        onClick={handleSubmit}
                        disabled={(!input.trim() && files.length === 0) || status === AnalysisStatus.ANALYZING}
                        className={`p-3 rounded-full mb-1 transition-all ${
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
                 <div className="text-[10px] text-gray-600 text-center py-1 pb-2">
                    AuditAI 可能会生成不准确的信息，请核对重要信息。
                </div>
            </div>
        </div>

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
