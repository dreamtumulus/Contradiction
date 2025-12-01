import React, { useState, useEffect } from 'react';
import { AppSettings, DEFAULT_SYSTEM_INSTRUCTION, AIProvider } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const GOOGLE_MODELS = [
  { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro (推荐 - 2M上下文)' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (快速)' },
  { id: 'gemini-2.5-flash-thinking', name: 'Gemini 2.5 Flash Thinking' }
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  const handleProviderChange = (provider: AIProvider) => {
    let defaultBaseUrl = '';
    let defaultModel = '';

    if (provider === 'openrouter') {
      defaultBaseUrl = 'https://openrouter.ai/api/v1';
      defaultModel = 'anthropic/claude-3-opus';
    } else if (provider === 'local') {
      defaultBaseUrl = 'http://localhost:11434/v1';
      defaultModel = 'qwen2.5:14b';
    } else {
      defaultModel = 'gemini-3-pro-preview';
    }

    setLocalSettings(prev => ({
      ...prev,
      provider,
      baseUrl: defaultBaseUrl,
      model: defaultModel,
      apiKey: provider === 'local' ? 'sk-dummy' : prev.apiKey // Keep key for others, set dummy for local
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-secondary rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-secondary flex justify-between items-center bg-[#1E1F20]">
          <h2 className="text-xl font-semibold text-text">系统设置</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-8">
          
          {/* Provider Selection */}
          <div className="space-y-4">
             <h3 className="text-sm font-medium text-primary uppercase tracking-wider">模型服务商</h3>
             <div className="grid grid-cols-3 gap-3">
                <button 
                  onClick={() => handleProviderChange('google')}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    localSettings.provider === 'google' 
                    ? 'bg-primary/10 border-primary text-primary' 
                    : 'bg-[#131314] border-secondary text-gray-400 hover:bg-[#2D2E2F]'
                  }`}
                >
                  Google Gemini
                </button>
                <button 
                  onClick={() => handleProviderChange('openrouter')}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    localSettings.provider === 'openrouter' 
                    ? 'bg-primary/10 border-primary text-primary' 
                    : 'bg-[#131314] border-secondary text-gray-400 hover:bg-[#2D2E2F]'
                  }`}
                >
                  OpenRouter
                </button>
                <button 
                  onClick={() => handleProviderChange('local')}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    localSettings.provider === 'local' 
                    ? 'bg-primary/10 border-primary text-primary' 
                    : 'bg-[#131314] border-secondary text-gray-400 hover:bg-[#2D2E2F]'
                  }`}
                >
                  本地/Local
                </button>
             </div>
          </div>

          {/* Configuration Fields */}
          <div className="space-y-5 animate-fade-in">
            {localSettings.provider === 'google' && (
              <>
                 <div>
                  <label className="block text-sm text-gray-400 mb-2">Google API Key</label>
                  <input 
                    type="password" 
                    value={localSettings.apiKey}
                    onChange={(e) => setLocalSettings({...localSettings, apiKey: e.target.value})}
                    placeholder="AIzaSy..."
                    className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    直接连接 Google 服务器，支持原生 PDF 解析和 2M+ Token 上下文。
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">选择模型</label>
                  <select 
                    value={localSettings.model}
                    onChange={(e) => setLocalSettings({...localSettings, model: e.target.value})}
                    className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary appearance-none"
                  >
                    {GOOGLE_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {localSettings.provider === 'openrouter' && (
              <>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">OpenRouter API Key</label>
                  <input 
                    type="password" 
                    value={localSettings.apiKey}
                    onChange={(e) => setLocalSettings({...localSettings, apiKey: e.target.value})}
                    placeholder="sk-or-v1-..."
                    className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Base URL</label>
                  <input 
                    type="text" 
                    value={localSettings.baseUrl}
                    onChange={(e) => setLocalSettings({...localSettings, baseUrl: e.target.value})}
                    className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">模型名称 (Model ID)</label>
                  <input 
                    type="text" 
                    value={localSettings.model}
                    onChange={(e) => setLocalSettings({...localSettings, model: e.target.value})}
                    placeholder="例如: anthropic/claude-3-5-sonnet"
                    className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    请输入 OpenRouter 支持的模型 ID。注意：大多数模型对 PDF 文件的直接上传支持较差，建议上传提取后的文本。
                  </p>
                </div>
              </>
            )}

            {localSettings.provider === 'local' && (
              <>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Base URL</label>
                  <input 
                    type="text" 
                    value={localSettings.baseUrl}
                    onChange={(e) => setLocalSettings({...localSettings, baseUrl: e.target.value})}
                    placeholder="http://localhost:11434/v1"
                    className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    兼容 OpenAI 格式的本地服务接口 (例如 Ollama, vLLM, LMStudio)。
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">模型名称</label>
                  <input 
                    type="text" 
                    value={localSettings.model}
                    onChange={(e) => setLocalSettings({...localSettings, model: e.target.value})}
                    placeholder="例如: qwen2.5:14b"
                    className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  />
                </div>
                 <div>
                  <label className="block text-sm text-gray-400 mb-2">API Key (可选)</label>
                  <input 
                    type="password" 
                    value={localSettings.apiKey}
                    onChange={(e) => setLocalSettings({...localSettings, apiKey: e.target.value})}
                    placeholder="本地部署通常不需要Key，或填写任意字符"
                    className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-primary transition-colors font-mono text-sm"
                  />
                </div>
              </>
            )}
          </div>

          <div className="h-px bg-secondary w-full"></div>

          {/* System Instruction */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-primary uppercase tracking-wider">审核规则 (System Prompt)</h3>
            <div>
              <label className="block text-sm text-gray-400 mb-2">自定义系统指令</label>
              <textarea 
                rows={6}
                value={localSettings.systemInstruction}
                onChange={(e) => setLocalSettings({...localSettings, systemInstruction: e.target.value})}
                className="w-full bg-[#131314] border border-secondary rounded-lg px-4 py-2 text-text text-sm focus:outline-none focus:border-primary font-mono leading-relaxed"
              />
              <button 
                onClick={() => setLocalSettings({...localSettings, systemInstruction: DEFAULT_SYSTEM_INSTRUCTION})}
                className="text-xs text-primary mt-2 hover:underline"
              >
                恢复默认法律审核指令
              </button>
            </div>
          </div>

        </div>

        <div className="p-6 border-t border-secondary bg-[#1E1F20] flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-text hover:bg-secondary transition-colors"
          >
            取消
          </button>
          <button 
            onClick={() => {
              onSave(localSettings);
              onClose();
            }}
            className="px-6 py-2 rounded-lg bg-primary text-surface font-medium hover:bg-white transition-colors shadow-lg shadow-primary/20"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
};
