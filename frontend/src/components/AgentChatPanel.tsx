import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Lightbulb, X, Plus, ArrowRight, History, MessageSquarePlus, Wrench, StopCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css';
import { agentApi, AgentMessage } from '../api/agent';
import { cognitiveChainApi } from '../api/knowledgeGraph';
import ToolCallCard, { ToolCallData } from './ToolCallCard';
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
  toolCalls?: ToolCallData[];
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

interface AgentChatPanelProps {
  bookTitle?: string;
  sourceDocId?: string;
  ocrText?: string;
  currentChapterIndex?: number;
  pendingQuestion?: string | null;
  onQuestionConsumed?: () => void;
  onChainStateChange?: (hasActiveChain: boolean, isLoading: boolean) => void;
  onChainUpdated?: () => void;
  externalMessage?: { role: 'user' | 'assistant' | 'system'; content: string; nodeType?: string; chapterIndex?: number; knowledgeNodeId?: string } | null;
  onExternalMessageConsumed?: () => void;
  activeChainId?: string | null;
  onActiveChainConsumed?: () => void;
}

const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
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
  activeChainId,
  onActiveChainConsumed,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentChainId, setCurrentChainId] = useState<string | null>(null);
  const [currentParentNodeId, setCurrentParentNodeId] = useState<string | null>(null);
  void currentParentNodeId; // kept for chain history compatibility
  const [chainHistory, setChainHistory] = useState<ChainHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{x: number; y: number; text: string; nodeId?: string} | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  const handleLoadChainRef = useRef<(chainId: string) => void>(() => {});
  useEffect(() => {
    if (activeChainId) {
      handleLoadChainRef.current(activeChainId);
      onActiveChainConsumed?.();
    }
  }, [activeChainId]);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'> & { id?: string }) => {
    setMessages((prev) => [
      ...prev,
      { ...msg, id: msg.id || Date.now().toString() + Math.random(), timestamp: new Date() },
    ]);
  }, []);

  const questionQueueRef = useRef<{ question: string; knowledgeNodeId?: string }[]>([]);
  const isProcessingRef = useRef(false);
  const onQuestionConsumedRef = useRef(onQuestionConsumed);
  onQuestionConsumedRef.current = onQuestionConsumed;
  const onChainUpdatedRef = useRef(onChainUpdated);
  onChainUpdatedRef.current = onChainUpdated;

  /** 使用Agent API处理问题（支持function calling） */
  const processWithAgent = useCallback(async (question: string, knowledgeNodeId?: string) => {
    if (isProcessingRef.current) {
      questionQueueRef.current.push({ question, knowledgeNodeId });
      return;
    }

    isProcessingRef.current = true;
    addMessage({ role: 'user', content: question });
    setIsLoading(true);

    // 创建AbortController用于取消请求
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 构建对话历史
      const chatHistory: AgentMessage[] = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));
      chatHistory.push({ role: 'user', content: question });

      // 使用流式API
      const response = await fetch(agentApi.chatStreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          book_id: sourceDocId,
          book_title: bookTitle,
          source_doc_id: sourceDocId,
          chapter_index: currentChapterIndex,
          ocr_text: ocrText ? ocrText.slice(0, 4000) : undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Agent请求失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let fullContent = '';
      const toolCallsInMessage: ToolCallData[] = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === 'text') {
              fullContent += event.content;
              // 实时更新assistant消息
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.id === 'streaming') {
                  return [...prev.slice(0, -1), { ...last, content: fullContent }];
                }
                return [...prev, {
                  id: 'streaming',
                  role: 'assistant' as const,
                  content: fullContent,
                  timestamp: new Date(),
                }];
              });
            } else if (event.type === 'tool_call_start') {
              const tc: ToolCallData = {
                toolName: event.tool_name,
                toolId: event.tool_id,
                arguments: event.arguments || {},
                status: 'running',
              };
              toolCallsInMessage.push(tc);
              // 更新消息中的工具调用
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [...prev.slice(0, -1), { ...last, toolCalls: [...toolCallsInMessage] }];
                }
                return prev;
              });
            } else if (event.type === 'tool_call_result') {
              const tc = toolCallsInMessage.find(t => t.toolId === event.tool_id);
              if (tc) {
                tc.status = event.result?.success ? 'completed' : 'error';
                tc.result = event.result;
              }
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return [...prev.slice(0, -1), { ...last, toolCalls: [...toolCallsInMessage] }];
                }
                return prev;
              });
            } else if (event.type === 'done') {
              // 流式完成
              if (fullContent) {
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.id === 'streaming' || last?.role === 'assistant') {
                    return [...prev.slice(0, -1), {
                      ...last,
                      id: last.id === 'streaming' ? Date.now().toString() : last.id,
                      content: event.message || fullContent,
                      toolCalls: toolCallsInMessage.length > 0 ? toolCallsInMessage : undefined,
                    }];
                  }
                  return prev;
                });
              }
            } else if (event.type === 'error') {
              addMessage({ role: 'system', content: `[错误] ${event.error}` });
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      // 如果没有收到done事件，手动完成
      if (fullContent) {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.id === 'streaming') {
            return [...prev.slice(0, -1), {
              ...last,
              id: Date.now().toString(),
              content: fullContent,
              toolCalls: toolCallsInMessage.length > 0 ? toolCallsInMessage : undefined,
            }];
          }
          return prev;
        });
      }

      setCurrentChainId('agent-active');
      onQuestionConsumedRef.current?.();
      onChainUpdatedRef.current?.();
    } catch (err: unknown) {
      // 用户主动取消
      if (err instanceof DOMException && err.name === 'AbortError') {
        // 将streaming消息标记为已停止
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.id === 'streaming' || last?.role === 'assistant') {
            return [...prev.slice(0, -1), {
              ...last,
              id: last.id === 'streaming' ? Date.now().toString() : last.id,
              content: last.content + '\n\n*[已停止]*',
              toolCalls: last.toolCalls,
            }];
          }
          return prev;
        });
      } else {
        const msg = err instanceof Error ? err.message : '请求失败';
        addMessage({ role: 'system', content: `[错误] ${msg}` });
      }
    } finally {
      setIsLoading(false);
      isProcessingRef.current = false;
      abortControllerRef.current = null;

      const next = questionQueueRef.current.shift();
      if (next) {
        setTimeout(() => processWithAgent(next.question, next.knowledgeNodeId), 0);
      }
    }
  }, [messages, sourceDocId, bookTitle, currentChapterIndex, ocrText, addMessage, loadChainHistory]);

  useEffect(() => {
    if (!pendingQuestion) return;
    processWithAgent(pendingQuestion);
  }, [pendingQuestion, processWithAgent]);

  useEffect(() => {
    if (externalMessage) {
      const prefix = externalMessage.nodeType === 'QuickSummary' ? '[梳理] ' :
                     externalMessage.nodeType === 'DetailedQuestion' ? '[提问] ' : '';
      const content = prefix + externalMessage.content;
      onExternalMessageConsumed?.();
      processWithAgent(content, externalMessage.knowledgeNodeId);
    }
  }, [externalMessage, processWithAgent, onExternalMessageConsumed]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput('');
    await processWithAgent(trimmed);
  }, [input, isLoading, processWithAgent]);

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 0) {
      const msgEl = (e.target as HTMLElement).closest('[data-node-id]');
      const nodeId = msgEl?.getAttribute('data-node-id') || undefined;
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        text: selectedText,
        nodeId,
      });
    }
  }, []);

  const handleAskSelected = useCallback(async () => {
    if (!contextMenu?.text) return;
    const question = contextMenu.text;
    setContextMenu(null);
    window.getSelection()?.removeAllRanges();
    await processWithAgent(`追问：${question}`);
  }, [contextMenu, processWithAgent]);

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
  handleLoadChainRef.current = handleLoadChain;

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

  return (
    <div className="cognitive-chain-panel">
      <div className="cc-toolbar">
        <div className="cc-toolbar-left">
          {currentChainId && (
            <span className="cc-chain-indicator"><Wrench size={14} /> Agent 活跃</span>
          )}
        </div>
        <div className="cc-toolbar-right" style={{ position: 'relative' }}>
          <button className="cc-btn" onClick={() => setMenuOpen(!menuOpen)} title="菜单">
            <Plus size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="cc-menu-overlay" onClick={() => setMenuOpen(false)} />
              <div className="cc-dropdown-menu">
                <div className="cc-menu-item" onClick={() => { handleNewChain(); setMenuOpen(false); }}>
                  <MessageSquarePlus size={14} />
                  <span>新建对话</span>
                </div>
                <div className="cc-menu-item" onClick={() => { setDrawerOpen(true); setMenuOpen(false); }}>
                  <History size={14} />
                  <span>历史记录</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 左侧抽屉 - 历史记录 */}
      {drawerOpen && (
        <div className="cc-drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}
      <div className={`cc-drawer ${drawerOpen ? 'open' : ''}`}>
        <div className="cc-drawer-header">
          <span className="cc-drawer-title"><History size={14} /> 历史记录</span>
          <button className="cc-drawer-close" onClick={() => setDrawerOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="cc-drawer-list">
          {historyLoading ? (
            <div className="cc-history-loading">加载中...</div>
          ) : chainHistory.length === 0 ? (
            <div className="cc-history-empty">暂无历史记录</div>
          ) : (
            chainHistory.map((chain) => (
              <div
                key={chain.id}
                className={`cc-history-item ${currentChainId === chain.id ? 'active' : ''}`}
                onClick={() => { handleLoadChain(chain.id); setDrawerOpen(false); }}
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
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="cc-messages" ref={messagesContainerRef} onContextMenu={handleContextMenu}>
        {messages.length === 0 && (
          <div className="cc-empty">
            <div className="cc-empty-icon"><Lightbulb size={32} /></div>
            <h3>Agent 助手</h3>
            <p>输入问题或指令，AI 将调用工具帮你处理文档、知识图谱等</p>
            <p className="cc-empty-hint">支持OCR识别、知识图谱管理、文档处理等工具调用</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`cc-message cc-message-${msg.role}`} data-node-id={msg.nodeId || undefined}>
            <div className="cc-message-header">
              {msg.role === 'user' && <span className="cc-role-badge cc-role-user">你</span>}
              {msg.role === 'assistant' && <span className="cc-role-badge cc-role-assistant">AI</span>}
              {msg.role === 'system' && <span className="cc-role-badge cc-role-system">系统</span>}
              {msg.concept && <span className="cc-concept-tag">{msg.concept}</span>}
              {msg.domain && <span className="cc-domain-tag">{msg.domain}</span>}
            </div>
            <div className="cc-message-content">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
                {msg.content}
              </ReactMarkdown>
            </div>
            {/* 工具调用卡片 */}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="cc-tool-calls">
                {msg.toolCalls.map((tc) => (
                  <ToolCallCard key={tc.toolId} toolCall={tc} />
                ))}
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
              <span className="cc-context-menu-icon"><Lightbulb size={14} /></span>
              <span>追问选中内容</span>
            </div>
            <div className="cc-context-menu-divider" />
            <div className="cc-context-menu-item" onClick={() => setContextMenu(null)}>
              <span className="cc-context-menu-icon"><X size={14} /></span>
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
          placeholder="输入问题或指令...（支持工具调用）"
          rows={2}
          disabled={isLoading}
        />
        {isLoading ? (
          <button
            className="cc-stop-btn"
            onClick={handleStop}
            title="停止生成"
          >
            <StopCircle size={16} />
          </button>
        ) : (
          <button
            className="cc-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
            title="发送"
          >
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(AgentChatPanel);
