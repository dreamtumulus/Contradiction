import React from 'react';
import { Message, AttachedFile } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import { formatFileSize } from '../utils/fileUtils';

interface ChatBubbleProps {
  message: Message;
}

const FileCard: React.FC<{ file: AttachedFile }> = ({ file }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-[#2D2E2F] border border-gray-700 max-w-xs mb-2">
    <div className="w-10 h-10 rounded bg-red-900/50 flex items-center justify-center text-red-200">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
    </div>
    <div className="overflow-hidden">
      <p className="text-sm font-medium text-gray-200 truncate">{file.name}</p>
      <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
    </div>
  </div>
);

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-8 animate-fade-in`}>
      <div className={`flex flex-col max-w-[85%] md:max-w-[75%] ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* Author Label */}
        <div className="text-xs text-gray-500 mb-1 ml-1">
          {isUser ? '审核员' : 'AuditAI 审核助手'}
        </div>

        {/* Message Content Container */}
        <div className={`
          px-6 py-4 rounded-2xl shadow-sm
          ${isUser 
            ? 'bg-[#2B2C2D] text-white rounded-tr-sm' 
            : 'bg-transparent text-gray-100 rounded-tl-sm px-0 py-0' 
          }
        `}>
          {message.files && message.files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 justify-end">
              {message.files.map((file, idx) => (
                <FileCard key={idx} file={file} />
              ))}
            </div>
          )}

          {isUser ? (
             <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
             <MarkdownRenderer content={message.content} />
          )}
        </div>
        
        {message.isError && (
          <div className="mt-2 text-sm text-red-400 bg-red-900/20 px-3 py-1 rounded">
            生成过程中发生错误
          </div>
        )}
      </div>
    </div>
  );
};
