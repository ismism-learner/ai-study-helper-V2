import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cognitiveChainApi, knowledgeGraphApi } from '../api/knowledgeGraph';
import '../styles/cognitive-chain-panel.css';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  nodeId?: string;
  concept?: string;
  domain?: string;
  confidence?: number;
  source?: string;
  timestamp: Date;
}

interface ChainHistory {
  id: string;
  title: string;
  root_concept: string;
  root_concept_label?: string;
  root_definition?: string;
  created_at: string;
  total_nodes: number;
}

interface CognitiveChainPanelProps {
  bookTitle?: string;
  sourceDocId?: string;
  ocrText?: string;
  currentChapterIndex?: number;
  pendingQuestion?: string | null;
  onQuestionConsumed?: () => void;
  onChainStateChange?: (hasActiveChain: boolean, isLoading: boolean) => void;
  onChainUpdated?: () => void;
  externalMessage?: { role: 'user' | 'assistant' | 'system'; content: string; nodeType?: string } | null;
  onExternalMessageConsumed?: () => void;
}

const CognitiveChainPanel: React.FC<CognitiveChainPanelProps> = ({
  bookTitle,
  sourceDocId,
  ocrText,
  currentChapterIndex,
  pendingQuestion,
  onQuestionConsumed,
  onChainStateChange,
  onChainUpdated,
  externalMessage,
  onExternalMessageConsumed,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentChainId, setCurrentChainId] = useState<string | null>(null);
  const [currentParentNodeId, setCurrentParentNodeId] = useState<string | null>(null);
  const [neo4jEnabled, setNeo4jEnabled] = useState(true);
  const [chainHistory, setChainHistory] = useState<ChainHistory[]>([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, text: string, nodeId?: string} | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const loadChainHistory = useCallback(async () => {
    if (!sourceDocId) return;
    setHistoryLoading(true);
    try {
      const res = await cognitiveChainApi.getChainsBySourceDoc(sourceDocId);
      setChainHistory(res.data?.chains || []);
    } catch (err) {
      console.error('加载认知链历史失败:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [sourceDocId]);

  useEffect(() => {
    knowledgeGraphApi.healthCheck().then((res) => {
      const storage = res.data?.storage;
      const enabled = storage === 'sqlite' || res.data?.neo4j_enabled === true;
      setNeo4jEnabled(enabled);
    }).catch(() => {
      setNeo4jEnabled(false);
    });
  }, []);

  useEffect(() => {
    if (sourceDocId) {
      loadChainHistory();
    }
  }, [sourceDocId, loadChainHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    onChainStateChange?.(!!currentChainId, isLoading);
  }, [currentChainId, isLoading, onChainStateChange]);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: Date.now().toString() + Math.random(), timestamp: new Date() },
    ]);
  }, []);

  useEffect(() => {
    if (externalMessage) {
      const prefix = externalMessage.nodeType === 'QuickSummary' ? '📋 快速梳理：' : 
                     externalMessage.nodeType === 'DetailedQuestion' ? '🔍 详细提问：' : '';
      addMessage({
        role: externalMessage.role,
        content: prefix + externalMessage.content,
      });
      onExternalMessageConsumed?.();
    }
  }, [externalMessage, addMessage, onExternalMessageConsumed]);

  const questionQueueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);
  const onQuestionConsumedRef = useRef(onQuestionConsumed);
  onQuestionConsumedRef.current = onQuestionConsumed;
  const onChainUpdatedRef = useRef(onChainUpdated);
  onChainUpdatedRef.current = onChainUpdated;

  const processExternalQuestion = useCallback(async (question: string) => {
    if (isProcessingRef.current) {
      questionQueueRef.current.push(question);
      return;
    }

    isProcessingRef.current = true;
    addMessage({ role: 'user', content: question });
    setIsLoading(true);

    try {
      const context = ocrText
        ? question + '\n\n参考内容：\n' + ocrText.slice(0, 2000)
        : question;

      if (currentChainId) {
        addMessage({ role: 'system', content: '正在扩展认知链...' });
        const expandContext = ocrText
          ? question + '\n\n参考内容：\n' + ocrText.slice(0, 1000)
          : question;
        const res = await cognitiveChainApi.expandChain({
          chain_id: currentChainId,
          parent_node_id: currentParentNodeId!,
          concept_to_explain: question,
          context: expandContext,
          source_doc_id: sourceDocId,
          source_doc_title: bookTitle,
          source_chapter_index: currentChapterIndex,
        });
        const node = res.data;
        setCurrentParentNodeId(node.id);
        addMessage({
          role: 'assistant',
          content: node.definition || `关于「${node.concept}」的解释已生成`,
          nodeId: node.id,
          concept: node.concept,
          domain: node.domain,
          confidence: node.confidence,
          source: 'ai_generated',
        });
      } else {
        addMessage({ role: 'system', content: '正在创建认知链，分析概念...' });
        const res = await cognitiveChainApi.createChain({
          root_concept: question,
          context,
          source_doc_id: sourceDocId,
          source_doc_title: bookTitle,
          source_chapter_index: currentChapterIndex,
        });
        const chain = res.data;
        setCurrentChainId(chain.id);
        const rootNode = chain.nodes?.[0];
        if (rootNode) {
          setCurrentParentNodeId(rootNode.id);
          addMessage({
            role: 'assistant',
            content: rootNode.definition || `关于「${rootNode.concept}」的解释已生成`,
            nodeId: rootNode.id,
            concept: rootNode.concept,
            domain: rootNode.domain,
            confidence: rootNode.confidence,
            source: 'knowledge_graph',
          });
        }
        loadChainHistory();
      }
      onQuestionConsumedRef.current?.();
      onChainUpdatedRef.current?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '提问失败';
      addMessage({ role: 'system', content: `❌ 错误: ${msg}` });
    } finally {
      setIsLoading(false);
      isProcessingRef.current = false;

      const next = questionQueueRef.current.shift();
      if (next) {
        setTimeout(() => processExternalQuestion(next), 0);
      }
    }
  }, [currentChainId, currentParentNodeId, ocrText, sourceDocId, bookTitle, addMessage, loadChainHistory]);

  useEffect(() => {
    if (!pendingQuestion) return;
    processExternalQuestion(pendingQuestion);
  }, [pendingQuestion, processExternalQuestion]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    addMessage({ role: 'user', content: trimmed });

    setIsLoading(true);

    try {
      if (!currentChainId) {
        addMessage({
          role: 'system',
          content: '正在创建认知链，分析概念...',
        });

        const context = ocrText ? trimmed + '\n\n参考内容：\n' + ocrText.slice(0, 2000) : trimmed;

        const res = await cognitiveChainApi.createChain({
          root_concept: trimmed,
          context,
          source_doc_id: sourceDocId,
          source_doc_title: bookTitle,
          source_chapter_index: currentChapterIndex,
        });

        const chain = res.data;
        setCurrentChainId(chain.id);

        const rootNode = chain.nodes?.[0];
        if (rootNode) {
          setCurrentParentNodeId(rootNode.id);
          addMessage({
            role: 'assistant',
            content: rootNode.definition || `关于「${rootNode.concept}」的解释已生成`,
            nodeId: rootNode.id,
            concept: rootNode.concept,
            domain: rootNode.domain,
            confidence: rootNode.confidence,
            source: 'knowledge_graph',
          });
        }
        loadChainHistory();
      } else {
        const loadingId = Date.now().toString();
        addMessage({
          id: loadingId,
          role: 'system',
          content: '正在扩展认知链...',
        });

        const context = ocrText ? trimmed + '\n\n参考内容：\n' + ocrText.slice(0, 1000) : trimmed;

        const res = await cognitiveChainApi.expandChain({
          chain_id: currentChainId,
          parent_node_id: currentParentNodeId!,
          concept_to_explain: trimmed,
          context,
          source_doc_id: sourceDocId,
          source_doc_title: bookTitle,
          source_chapter_index: currentChapterIndex,
        });

        const node = res.data;
        setCurrentParentNodeId(node.id);

        setMessages(prev => prev.filter(m => m.id !== loadingId));

        addMessage({
          role: 'assistant',
          content: node.definition || `关于「${node.concept}」的解释已生成`,
          nodeId: node.id,
          concept: node.concept,
          domain: node.domain,
          confidence: node.confidence,
          source: 'ai_generated',
        });
      }
      onChainUpdatedRef.current?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '请求失败';
      addMessage({
        role: 'system',
        content: `❌ 错误: ${msg}`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, currentChainId, currentParentNodeId, ocrText, sourceDocId, bookTitle, addMessage, loadChainHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText && selectedText.length > 0) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        text: selectedText,
      });
    }
  }, []);

  const handleAskSelected = useCallback(async () => {
    if (!contextMenu?.text) return;
    
    const question = contextMenu.text;
    setContextMenu(null);
    
    // 清除选中文本
    window.getSelection()?.removeAllRanges();
    
    // 发送追问
    addMessage({ role: 'user', content: `追问：${question}` });
    setIsLoading(true);
    
    try {
      if (currentChainId && currentParentNodeId) {
        const loadingId = Date.now().toString();
        addMessage({
          id: loadingId,
          role: 'system',
          content: '正在扩展认知链...',
        });
        
        const context = ocrText ? question + '\n\n参考内容：\n' + ocrText.slice(0, 1000) : question;
        
        const res = await cognitiveChainApi.expandChain({
          chain_id: currentChainId,
          parent_node_id: currentParentNodeId,
          concept_to_explain: question,
          context,
          source_doc_id: sourceDocId,
          source_doc_title: bookTitle,
          source_chapter_index: currentChapterIndex,
        });
        
        const node = res.data;
        setCurrentParentNodeId(node.id);
        
        setMessages(prev => prev.filter(m => m.id !== loadingId));
        
        addMessage({
          role: 'assistant',
          content: node.definition || `关于「${node.concept}」的解释已生成`,
          nodeId: node.id,
          concept: node.concept,
          domain: node.domain,
          confidence: node.confidence,
          source: 'ai_generated',
        });
        
        onChainUpdatedRef.current?.();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '追问失败';
      addMessage({ role: 'system', content: `❌ 错误: ${msg}` });
    } finally {
      setIsLoading(false);
    }
  }, [contextMenu, currentChainId, currentParentNodeId, ocrText, sourceDocId, bookTitle, addMessage, currentChapterIndex]);

  const handleNewChain = () => {
    setCurrentChainId(null);
    setCurrentParentNodeId(null);
    setMessages([]);
  };

  const handleLoadChain = async (chainId: string) => {
    setIsLoading(true);
    try {
      const res = await cognitiveChainApi.getChain(chainId);
      const chain = res.data;
      setCurrentChainId(chain.id);
      setMessages([]);
      
      for (const node of chain.nodes || []) {
        if (node.node_type === 'RootConcept') {
          addMessage({
            role: 'user',
            content: chain.root_concept || node.concept,
          });
        }
        addMessage({
          role: 'assistant',
          content: node.definition || `关于「${node.concept}」的解释`,
          nodeId: node.id,
          concept: node.concept,
          domain: node.domain,
          source: 'loaded',
        });
      }
      
      const lastNode = chain.nodes?.[chain.nodes.length - 1];
      if (lastNode) {
        setCurrentParentNodeId(lastNode.id);
      }
    } catch (err) {
      console.error('加载认知链失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChain = async (e: React.MouseEvent, chainId: string) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除这条认知链吗？')) return;
    
    try {
      await cognitiveChainApi.deleteChain(chainId);
      setChainHistory(prev => prev.filter(c => c.id !== chainId));
      if (currentChainId === chainId) {
        handleNewChain();
      }
      onChainUpdatedRef.current?.();
    } catch (err) {
      console.error('删除认知链失败:', err);
    }
  };

  const handleBuildKnowledgeGraph = async () => {
    if (!ocrText || !bookTitle) return;
    setIsLoading(true);
    addMessage({
      role: 'system',
      content: `正在从「${bookTitle}」的文本构建知识图谱，这可能需要几分钟...`,
    });
    try {
      const res = await knowledgeGraphApi.processBook({
        text: ocrText,
        title: bookTitle,
      });
      addMessage({
        role: 'system',
        content: `✅ 知识图谱构建完成！提取了 ${res.data.entity_count} 个实体，${res.data.relation_count} 个关系。`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '构建失败';
      addMessage({
        role: 'system',
        content: `❌ 知识图谱构建失败: ${msg}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  if (!neo4jEnabled) {
    return (
      <div className="cc-panel-disabled">
        <div className="cc-disabled-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3>认知链未启用</h3>
          <p>请在设置中启用 Neo4j 连接以使用认知链功能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cognitive-chain-panel">
      <div className="cc-toolbar">
        <div className="cc-toolbar-left">
          {currentChainId && (
            <span className="cc-chain-indicator">🔗 认知链活跃</span>
          )}
        </div>
        <div className="cc-toolbar-right">
          {ocrText && bookTitle && (
            <button
              className="cc-btn cc-btn-build"
              onClick={handleBuildKnowledgeGraph}
              disabled={isLoading}
              title="从当前文本构建知识图谱"
            >
              构建图谱
            </button>
          )}
          {currentChainId && (
            <button className="cc-btn" onClick={handleNewChain} title="新建认知链">
              ＋
            </button>
          )}
        </div>
      </div>

      {sourceDocId && (
        <div className="cc-history-section">
          <div 
            className="cc-history-header"
            onClick={() => setHistoryExpanded(!historyExpanded)}
          >
            <div className="cc-history-title">
              <span>📚 历史记录</span>
              {chainHistory.length > 0 && (
                <span className="cc-history-count">{chainHistory.length}</span>
              )}
            </div>
            <span className={`cc-history-toggle ${historyExpanded ? 'expanded' : ''}`}>▼</span>
          </div>
          
          {historyExpanded && (
            <div className="cc-history-list">
              {historyLoading ? (
                <div className="cc-history-loading">加载中...</div>
              ) : chainHistory.length === 0 ? (
                <div className="cc-history-empty">暂无历史记录</div>
              ) : (
                chainHistory.map((chain) => (
                  <div
                    key={chain.id}
                    className={`cc-history-item ${currentChainId === chain.id ? 'active' : ''}`}
                    onClick={() => handleLoadChain(chain.id)}
                  >
                    <div className="cc-history-item-left">
                      <div className="cc-history-item-label">
                        {chain.root_concept_label || chain.root_concept?.slice(0, 20) || '未命名'}
                      </div>
                      <div className="cc-history-item-time">
                        {formatTime(chain.created_at)} · {chain.total_nodes} 节点
                      </div>
                    </div>
                    <div className="cc-history-item-right">
                      <button
                        className="cc-history-delete"
                        onClick={(e) => handleDeleteChain(e, chain.id)}
                        title="删除"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="cc-messages" ref={messagesContainerRef} onContextMenu={handleContextMenu}>
        {messages.length === 0 && (
          <div className="cc-empty">
            <div className="cc-empty-icon">💡</div>
            <h3>开始认知探索</h3>
            <p>输入一个概念或问题，AI 将为你构建认知链</p>
            <p className="cc-empty-hint">支持层层追问，形成完整的学习路径</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`cc-message cc-message-${msg.role}`}>
            <div className="cc-message-header">
              {msg.role === 'user' && <span className="cc-role-badge cc-role-user">你</span>}
              {msg.role === 'assistant' && <span className="cc-role-badge cc-role-assistant">AI</span>}
              {msg.role === 'system' && <span className="cc-role-badge cc-role-system">系统</span>}
              {msg.concept && <span className="cc-concept-tag">{msg.concept}</span>}
              {msg.domain && <span className="cc-domain-tag">{msg.domain}</span>}
            </div>
            <div className="cc-message-content">{msg.content}</div>
            {msg.role === 'assistant' && msg.nodeId && (
              <div className="cc-message-actions">
                <button
                  className="cc-action-btn"
                  onClick={() => {
                    setInput('');
                    setCurrentParentNodeId(msg.nodeId!);
                  }}
                  title="基于此节点继续追问"
                >
                  追问 ↓
                </button>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="cc-message cc-message-system">
            <div className="cc-typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        
        {contextMenu && (
          <div
            className="cc-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseLeave={() => setContextMenu(null)}
          >
            <div className="cc-context-menu-item" onClick={handleAskSelected}>
              <span className="cc-context-menu-icon">❓</span>
              <span>追问选中内容</span>
            </div>
            <div className="cc-context-menu-divider" />
            <div className="cc-context-menu-item" onClick={() => setContextMenu(null)}>
              <span className="cc-context-menu-icon">✕</span>
              <span>取消</span>
            </div>
          </div>
        )}
      </div>

      <div className="cc-input-area">
        <textarea
          ref={inputRef}
          className="cc-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentChainId ? '继续追问...' : '输入概念或问题开始探索...'}
          rows={2}
          disabled={isLoading}
        />
        <button
          className="cc-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          title="发送"
        >
          ➤
        </button>
      </div>
    </div>
  );
};

export default React.memo(CognitiveChainPanel);
