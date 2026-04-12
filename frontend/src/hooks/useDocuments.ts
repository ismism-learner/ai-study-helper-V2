import { useState, useCallback, useEffect } from 'react';
import { Document, Folder, CreateDocumentRequest, Highlight } from '../types';
import { documentApi, folderApi, highlightApi } from '../api';

type TabType = 'framework' | 'edit' | 'view';

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeDocument, setActiveDocument] = useState<Document | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('framework');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [generatingDocIds, setGeneratingDocIds] = useState<Set<string>>(new Set());
  const [streamingContents, setStreamingContents] = useState<Map<string, string>>(new Map());
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const loadFolders = useCallback(async () => {
    try {
      const response = await folderApi.list();
      setFolders(response.data);
    } catch (error) {
      console.error('Failed to load folders:', error);
    }
  }, []);

  const loadDocuments = useCallback(async (folderId?: string | null) => {
    try {
      const params: Record<string, string> = {};
      if (folderId) params.folder_id = folderId;
      const response = await documentApi.list(params);
      const docsWithHighlights = response.data.map((doc: Document) => ({
        ...doc,
        highlights: doc.highlights || [],
      }));
      setDocuments(docsWithHighlights);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  }, []);

  useEffect(() => {
    loadFolders();
    loadDocuments();
  }, [loadFolders, loadDocuments]);

  useEffect(() => {
    const handlePageChange = (e: CustomEvent<{ pageNumber: number }>) => {
      console.log('[App] Received pdf-page-changed event:', e.detail.pageNumber);
      setCurrentPage(e.detail.pageNumber);
    };

    window.addEventListener('pdf-page-changed', handlePageChange as EventListener);

    return () => {
      window.removeEventListener('pdf-page-changed', handlePageChange as EventListener);
    };
  }, []);

  const handleSelectFolder = useCallback((folderId: string | null) => {
    setSelectedFolderId(folderId);
    loadDocuments(folderId);
  }, [loadDocuments]);

  const handleSelectDocument = useCallback(async (id: string, page?: number) => {
    try {
      const response = await documentApi.get(id);
      const docWithHighlights = {
        ...response.data,
        highlights: response.data.highlights || [],
      };
      setActiveDocument(docWithHighlights);
      setActiveTab('framework');
      
      if (page) {
        (window as any).__timelineJumpPage = page;
      }
    } catch (error) {
      console.error('Failed to load document:', error);
    }
  }, []);

  const handleCreateDocument = useCallback(async (data: CreateDocumentRequest) => {
    setIsLoading(true);
    try {
      const response = await documentApi.create(data);
      const docWithHighlights = {
        ...response.data,
        highlights: response.data.highlights || [],
      };
      setDocuments(prev => [docWithHighlights, ...prev]);
      setActiveDocument(docWithHighlights);
      return { success: true, doc: docWithHighlights };
    } catch (error) {
      console.error('Failed to create document:', error);
      alert('创建文档失败，请重试');
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleUploadDocument = useCallback(async (file: File, folderId?: string | null) => {
    setUploadLoading(true);
    try {
      const response = await documentApi.upload(file, folderId || undefined);
      const docWithHighlights = {
        ...response.data,
        highlights: response.data.highlights || [],
      };
      setDocuments(prev => [docWithHighlights, ...prev]);
      setActiveDocument(docWithHighlights);
      return { success: true, doc: docWithHighlights };
    } catch (error) {
      console.error('Failed to upload document:', error);
      alert('上传文档失败，请重试');
      return { success: false };
    } finally {
      setUploadLoading(false);
    }
  }, []);

  const handleGenerateFramework = useCallback(async (docId?: string) => {
    const targetDocId = docId || activeDocument?.id;
    if (!targetDocId) return;
    
    const targetDoc = documents.find(d => d.id === targetDocId) || activeDocument;
    if (!targetDoc) return;

    setGeneratingDocIds(prev => new Set(prev).add(targetDocId));
    setStreamingContents(prev => {
      const newMap = new Map(prev);
      newMap.set(targetDocId, '');
      return newMap;
    });
    
    await documentApi.generateFrameworkStream(
      targetDocId,
      (chunk: string) => {
        setStreamingContents(prev => {
          const newMap = new Map(prev);
          const current = newMap.get(targetDocId) || '';
          newMap.set(targetDocId, current + chunk);
          return newMap;
        });
      },
      (fullContent: string) => {
        const updatedDoc = {
          ...targetDoc,
          framework_content: fullContent,
          highlights: targetDoc.highlights,
        };
        
        if (activeDocument?.id === targetDocId) {
          setActiveDocument(updatedDoc);
        }
        setDocuments(prev => prev.map(d =>
          d.id === targetDocId ? { ...updatedDoc, highlights: d.highlights } : d
        ));
        
        setGeneratingDocIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(targetDocId);
          return newSet;
        });
        setStreamingContents(prev => {
          const newMap = new Map(prev);
          newMap.delete(targetDocId);
          return newMap;
        });
      },
      (error: string) => {
        console.error('Failed to generate framework:', error);
        alert(error || '生成正文失败，请重试');
        
        setGeneratingDocIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(targetDocId);
          return newSet;
        });
        setStreamingContents(prev => {
          const newMap = new Map(prev);
          newMap.delete(targetDocId);
          return newMap;
        });
      }
    );
  }, [activeDocument, documents]);

  const handleDeleteDocument = useCallback(async (id: string) => {
    if (!window.confirm('确定要删除这个文档吗？所有相关的高亮标记和解释都将被删除。')) {
      return false;
    }

    try {
      await documentApi.delete(id);
      const newDocuments = documents.filter((d) => d.id !== id);
      setDocuments(newDocuments);
      if (activeDocument?.id === id) {
        setActiveDocument(newDocuments.length > 0 ? newDocuments[0] : null);
      }
      return true;
    } catch (error) {
      console.error('Failed to delete document:', error);
      alert('删除失败，请重试');
      return false;
    }
  }, [documents, activeDocument]);

  const handleHighlightCreated = useCallback((highlight: Highlight) => {
    if (!activeDocument) return;

    setActiveDocument({
      ...activeDocument,
      highlights: [...(activeDocument.highlights || []), highlight],
    });
  }, [activeDocument]);

  const handleHighlightDeleted = useCallback((id: string) => {
    if (!activeDocument) return;

    setActiveDocument({
      ...activeDocument,
      highlights: (activeDocument.highlights || []).filter((h) => h.id !== id),
    });
  }, [activeDocument]);

  const handleExplanationGenerated = useCallback((updatedHighlight: Highlight) => {
    if (!activeDocument) return;

    setActiveDocument({
      ...activeDocument,
      highlights: (activeDocument.highlights || []).map((h) =>
        h.id === updatedHighlight.id ? updatedHighlight : h
      ),
    });
  }, [activeDocument]);

  const handleFrameworkUpdate = useCallback((updatedDoc: Document) => {
    if (!activeDocument) return;
    setActiveDocument({
      ...activeDocument,
      framework_content: updatedDoc.framework_content,
    });
    setDocuments(prev => prev.map(d =>
      d.id === activeDocument?.id ? { ...d, framework_content: updatedDoc.framework_content } : d
    ));
  }, [activeDocument]);

  const handleCreateHighlightFromKeyword = useCallback(async (keyword: string) => {
    if (!activeDocument) return { success: false };

    const content = activeDocument.original_content || '';
    const keywordIndex = content.indexOf(keyword);
    
    if (keywordIndex === -1) {
      alert(`在文章中未找到关键词: "${keyword}"`);
      return { success: false };
    }

    const existingHighlight = (activeDocument.highlights || []).find(
      h => h.highlighted_text === keyword
    );
    
    if (existingHighlight) {
      alert(`关键词 "${keyword}" 已经被标记过了`);
      return { success: false };
    }

    try {
      const response = await highlightApi.create(activeDocument.id, {
        highlighted_text: keyword,
        start_offset: keywordIndex,
        end_offset: keywordIndex + keyword.length,
        highlight_type: 'keyword',
      });
      
      const newHighlight = response.data;
      setActiveDocument({
        ...activeDocument,
        highlights: [...(activeDocument.highlights || []), newHighlight],
      });
      return { success: true };
    } catch (error) {
      console.error('Failed to create highlight:', error);
      alert('创建高亮标记失败，请重试');
      return { success: false };
    }
  }, [activeDocument]);

  return {
    documents,
    setDocuments,
    folders,
    setFolders,
    activeDocument,
    setActiveDocument,
    activeTab,
    setActiveTab,
    selectedFolderId,
    setSelectedFolderId,
    isLoading,
    uploadLoading,
    generatingDocIds,
    streamingContents,
    isDeleteMode,
    setIsDeleteMode,
    currentPage,
    setCurrentPage,
    loadFolders,
    loadDocuments,
    handleSelectFolder,
    handleSelectDocument,
    handleCreateDocument,
    handleUploadDocument,
    handleGenerateFramework,
    handleDeleteDocument,
    handleHighlightCreated,
    handleHighlightDeleted,
    handleExplanationGenerated,
    handleFrameworkUpdate,
    handleCreateHighlightFromKeyword,
  };
}
