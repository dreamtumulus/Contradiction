
import React from 'react';

// 这里实现了一个简单的 Markdown 解析器。
// 在生产环境中，建议使用 'react-markdown' 库以获得更完整的支持。
// 此处为了保持单文件简洁，仅实现了基础的 粗体、列表、标题 处理。

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  
  // 处理并渲染文本行
  const processText = (text: string) => {
    return text.split('\n').map((line, index) => {
      let processedLine = line;
      let style = "mb-2 text-gray-300 leading-relaxed";

      // 处理标题 (Headers)
      if (line.startsWith('### ')) {
        processedLine = line.replace('### ', '');
        style = "text-xl font-bold text-primary mt-6 mb-3";
      } else if (line.startsWith('## ')) {
        processedLine = line.replace('## ', '');
        style = "text-2xl font-bold text-white mt-8 mb-4 border-b border-gray-700 pb-2";
      } else if (line.startsWith('**') && line.endsWith('**')) {
          // 处理整行粗体
          processedLine = line.replace(/\*\*/g, '');
          style = "font-bold text-white mb-2";
      } else if (line.startsWith('- ')) {
        // 处理列表项
        processedLine = line.replace('- ', '• ');
        style = "ml-4 mb-2 text-gray-300";
      }

      // 处理行内粗体 (Inline bold)
      const parts = processedLine.split(/(\*\*.*?\*\*)/g);
      
      return (
        <div key={index} className={style}>
          {parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-white font-semibold">{part.replace(/\*\*/g, '')}</strong>;
            }
            return part;
          })}
        </div>
      );
    });
  };

  return (
    <div className="markdown-body font-sans text-base">
      {processText(content)}
    </div>
  );
};
