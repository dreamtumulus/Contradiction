import React from 'react';

// A simple recursive parser or cleaner could go here, 
// but for this snippet we'll do basic replacement to keep it dependency-free within the single file constraint logic
// while mimicking a good display. In a real app, use 'react-markdown'.

export const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  // Rudimentary rendering for the demo to avoid large library deps in this specific prompt format
  // Handling: **bold**, - list, \n newlines, ### Headers
  
  const processText = (text: string) => {
    return text.split('\n').map((line, index) => {
      let processedLine = line;
      let style = "mb-2 text-gray-300 leading-relaxed";

      if (line.startsWith('### ')) {
        processedLine = line.replace('### ', '');
        style = "text-xl font-bold text-primary mt-6 mb-3";
      } else if (line.startsWith('## ')) {
        processedLine = line.replace('## ', '');
        style = "text-2xl font-bold text-white mt-8 mb-4 border-b border-gray-700 pb-2";
      } else if (line.startsWith('**') && line.endsWith('**')) {
          // Full line bold
          processedLine = line.replace(/\*\*/g, '');
          style = "font-bold text-white mb-2";
      } else if (line.startsWith('- ')) {
        processedLine = line.replace('- ', '• ');
        style = "ml-4 mb-2 text-gray-300";
      }

      // Inline bold parsing
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
