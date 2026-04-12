import { useState, useCallback } from 'react';
import { BookDocument } from '../types';
import { bookApi, quarkApi } from '../api';

export interface QuarkUploadResult {
  book_id: string;
  book_title: string;
  success: boolean;
  message: string;
  share_url?: string;
  share_password?: string;
}

export interface QuarkUploadProgress {
  current: number;
  total: number;
  currentTag: string;
  percentage: number;
  startTime: number;
}

export interface QuarkUploadOptions {
  selectedTag?: string | null;
  displayBooks?: BookDocument[];
}

export function useQuarkUpload() {
  const [showQuarkModal, setShowQuarkModal] = useState(false);
  const [quarkUploading, setQuarkUploading] = useState(false);
  const [quarkUploadResults, setQuarkUploadResults] = useState<QuarkUploadResult[]>([]);
  const [quarkUploadProgress, setQuarkUploadProgress] = useState<QuarkUploadProgress | null>(null);

  const handleUploadToQuark = useCallback(async (options?: QuarkUploadOptions) => {
    try {
      let booksToUpload: BookDocument[];
      
      if (options?.displayBooks) {
        booksToUpload = options.displayBooks.filter((b: BookDocument) => 
          !b.quark_upload_status || b.quark_upload_status === 'not_uploaded'
        );
      } else {
        const response = await bookApi.list({});
        const books = response.data;
        booksToUpload = books.filter((b: BookDocument) => 
          !b.quark_upload_status || b.quark_upload_status === 'not_uploaded'
        );
      }
      
      if (booksToUpload.length === 0) {
        alert('没有需要上传的书籍');
        return;
      }
      
      setQuarkUploading(true);
      setQuarkUploadResults([]);
      
      const booksByTag: Record<string, typeof booksToUpload> = {};
      
      for (const book of booksToUpload) {
        if (book.tags && book.tags.length > 0) {
          const primaryTag = book.tags[0];
          if (!booksByTag[primaryTag]) {
            booksByTag[primaryTag] = [];
          }
          booksByTag[primaryTag].push(book);
        } else {
          if (!booksByTag['未分类']) {
            booksByTag['未分类'] = [];
          }
          booksByTag['未分类'].push(book);
        }
      }
      
      const results: QuarkUploadResult[] = [];
      const tags = Object.keys(booksByTag);
      const totalTags = tags.length;
      const startTime = Date.now();
      
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const tagBooks = booksByTag[tag];
        
        setQuarkUploadProgress({
          current: i + 1,
          total: totalTags,
          currentTag: tag,
          percentage: Math.round(((i + 1) / totalTags) * 100),
          startTime: startTime,
        });
        
        try {
          const response = await quarkApi.uploadByTag(tag, {
            book_ids: tagBooks.map(b => b.id),
          });
          
          if (response.data.success) {
            const skippedInfo = response.data.skipped_count > 0 
              ? `, 跳过 ${response.data.skipped_count} 本已上传` 
              : '';
            results.push({
              book_id: `folder-${tag}`,
              book_title: `📁 ${tag} (${response.data.uploaded_count}本上传${skippedInfo})`,
              success: true,
              message: `已上传到 ${response.data.folder_path}`,
              share_url: response.data.share_url || undefined,
              share_password: response.data.share_password || undefined,
            });
            
            for (const bookResult of response.data.results) {
              if (!bookResult.success && !bookResult.skipped) {
                results.push({
                  book_id: bookResult.book_id,
                  book_title: `  └ ${bookResult.book_title}`,
                  success: false,
                  message: bookResult.message,
                });
              }
            }
          } else {
            for (const book of tagBooks) {
              results.push({
                book_id: book.id,
                book_title: book.title,
                success: false,
                message: response.data.message,
              });
            }
          }
        } catch (error: unknown) {
          const axiosErr = error as { response?: { data?: { detail?: string } } };
          for (const book of tagBooks) {
            results.push({
              book_id: book.id,
              book_title: book.title,
              success: false,
              message: axiosErr.response?.data?.detail || '上传失败',
            });
          }
        }
      }
      
      setQuarkUploadResults(results);
      setQuarkUploading(false);
      setQuarkUploadProgress(null);
    } catch (error) {
      console.error('Failed to upload to Quark:', error);
      setQuarkUploading(false);
      setQuarkUploadProgress(null);
      alert('上传失败');
    }
  }, []);

  const handleCopyShareUrl = useCallback((url: string, password?: string) => {
    const text = password ? `${url} 提取码: ${password}` : url;
    navigator.clipboard.writeText(text);
  }, []);

  const handleCopyAllShareUrls = useCallback(() => {
    const successfulResults = quarkUploadResults.filter(r => r.success && r.share_url);
    if (successfulResults.length === 0) {
      alert('没有可复制的链接');
      return;
    }
    
    const text = successfulResults.map(result => {
      const passwordText = result.share_password ? ` 提取码: ${result.share_password}` : '';
      return `${result.book_title}：${result.share_url}${passwordText}`;
    }).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      alert(`已复制 ${successfulResults.length} 个链接到剪贴板`);
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('复制失败，请手动复制');
    });
  }, [quarkUploadResults]);

  const resetQuarkUpload = useCallback(() => {
    setQuarkUploadResults([]);
    setQuarkUploadProgress(null);
  }, []);

  return {
    showQuarkModal,
    setShowQuarkModal,
    quarkUploading,
    quarkUploadResults,
    quarkUploadProgress,
    handleUploadToQuark,
    handleCopyShareUrl,
    handleCopyAllShareUrls,
    resetQuarkUpload,
  };
}
