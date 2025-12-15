
import { AttachedFile } from '../types';

declare var mammoth: any; // 声明全局变量

/**
 * 将 File 对象转换为 Base64 字符串
 * @param file 浏览器 File 对象
 * @returns Promise<string> Base64 字符串 (不包含 data:前缀)
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        // 移除 Data URL 前缀 (例如 "data:application/pdf;base64,")，只保留实际数据
        const base64Data = reader.result.split(',')[1];
        resolve(base64Data);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = error => reject(error);
  });
};

/**
 * 提取 Word 文档 (.docx) 的文本内容
 * 使用 mammoth.js (需在 index.html 引入)
 */
export const extractTextFromDocx = async (file: File): Promise<string> => {
    if (typeof mammoth === 'undefined') {
        throw new Error("Mammoth library not loaded");
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
};


/**
 * 格式化文件大小，将字节转换为易读的格式 (KB, MB, GB)
 * @param bytes 字节数
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 验证文件类型是否受支持
 * @param file 
 */
export const isValidFileType = (file: File): boolean => {
  const validTypes = [
    'application/pdf',    // PDF 文档
    'text/plain',         // 纯文本
    'text/markdown',      // Markdown
    'application/json',   // JSON 数据
    'image/jpeg',         // 图片
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
  ];
  return validTypes.includes(file.type);
};
