import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, RefreshCw, Cloud, CheckCircle, XCircle, Loader2, ExternalLink, Copy, Palette, Database } from 'lucide-react';
import { quarkApi } from '../api';
import DuplicateManager from './DuplicateManager';
import ThemeSwitcher from './ThemeSwitcher';
import '../styles/theme-switcher.css';

interface SettingsModalProps {
  onClose: () => void;
}

interface SettingsData {
  api_key: string;
  api_base: string;
  model_name: string;
  ai_backend_type: string;
  opencode_cli_path: string;
  framework_prompt: string;
  explain_prompt: string;
  optimize_prompt: string;
  quick_note_polish_prompt: string;
  chapter_note_system_prompt: string;
  chapter_note_prompt: string;
  timeline_prompt: string;
  batch_upload_size: number;
  neo4j_enabled: boolean;
  neo4j_uri: string;
  neo4j_user: string;
  neo4j_password: string;
  kg_concept_prompt: string;
  quick_summary_prompt: string;
}

interface QuarkConfig {
  has_cookie: boolean;
  cli_available: boolean;
  cookie_preview: string | null;
}

const DEFAULT_FRAMEWORK_PROMPT = `请分析以下文章内容，生成一个详细的结构化框架。

【原文内容】
{content}

【任务要求】
1. 分析文章的主要章节和段落结构
2. 从原文中提取所有专业术语、技术名词、核心概念（必须使用原文中的准确词汇）
3. 为每个章节总结核心要点
4. 列出文中出现的关键定义和概念

【输出格式要求】
- 使用Markdown格式
- 优先使用原文中的专业术语和特殊词语
- 术语和概念要尽可能完整、全面地罗列
- 分为"文章结构"和"核心术语"两部分

请严格按照上述要求生成正文：`;

const DEFAULT_EXPLAIN_PROMPT = `请解释以下术语或概念在给定文章上下文中的准确含义和定义。

【术语】
{keyword}

【原文上下文】
{context}

【任务要求】
1. 给出该术语在本文中的准确含义
2. 解释其在上下文中的作用和意义
3. 如有关联的概念或事件，请一并说明

请给出详细、准确的解释：`;

const DEFAULT_OPTIMIZE_PROMPT = `请优化以下段落，将其转换为书面化表达并删除重复性内容。

【原文段落】
{paragraph}

【优化要求】
1. 将口语化表达转换为书面化表达
2. 删除重复性表达，保持语义完整
3. 优化句子结构，提高可读性
4. 保持原文核心语义不变

【输出要求】
- 保持原文的核心意思和关键信息
- 使用更正式、规范的书面语言
- 删除冗余和重复的表达
- 确保语句通顺、逻辑清晰
- 只输出优化后的文本，不要添加任何解释或说明

请输出优化后的段落：`;

const DEFAULT_QUICK_NOTE_POLISH_PROMPT = `请对以下快速笔记进行润色和优化，为其生成合适的标题并优化内容表达。

【原始笔记内容】
{content}

【处理要求】
1. 生成一个简洁准确的标题（不超过15个字）
2. 优化内容表达，使其更加书面化和条理清晰
3. 保持原文核心意思不变
4. 如果内容涉及多个要点，可以适当分点表述

【输出格式】
请严格按照以下JSON格式输出，不要添加任何其他内容：
{
  "title": "生成的标题",
  "content": "优化后的内容",
  "tags": ["标签1", "标签2", "标签3"]
}

请输出处理结果：`;

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<SettingsData>({
    api_key: '',
    api_base: '',
    model_name: '',
    ai_backend_type: 'api',
    opencode_cli_path: 'opencode',
    framework_prompt: '',
    explain_prompt: '',
    optimize_prompt: '',
    quick_note_polish_prompt: '',
    chapter_note_system_prompt: '',
    chapter_note_prompt: '',
    timeline_prompt: '',
    batch_upload_size: 5,
    neo4j_enabled: false,
    neo4j_uri: 'bolt://localhost:7687',
    neo4j_user: 'neo4j',
    neo4j_password: '',
    kg_concept_prompt: '',
    quick_summary_prompt: '',
  });
  const [fullApiKey, setFullApiKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'api' | 'api-configs' | 'prompts' | 'batch' | 'quark' | 'duplicates' | 'neo4j'>('api-configs');
  
  // API配置管理状态
  const [apiConfigs, setApiConfigs] = useState<Array<{
    id: string;
    name: string;
    api_key: string;
    api_base: string;
    model_name: string;
    is_active: boolean;
  }>>([]);
  const [newConfig, setNewConfig] = useState({
    name: '',
    api_key: '',
    api_base: '',
    model_name: '',
  });
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [quarkConfig, setQuarkConfig] = useState<QuarkConfig>({
    has_cookie: false,
    cli_available: false,
    cookie_preview: null,
  });
  const [quarkCookie, setQuarkCookie] = useState('');
  const [quarkTesting, setQuarkTesting] = useState(false);
  const [quarkTestResult, setQuarkTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [quarkSaving, setQuarkSaving] = useState(false);

  useEffect(() => {
    loadSettings();
    loadModels();
    loadQuarkConfig();
    loadApiConfigs();
  }, []);

  const loadApiConfigs = async () => {
    try {
      const response = await axios.get('/api/api-configs');
      setApiConfigs(response.data);
    } catch (err) {
      console.error('Failed to load API configs:', err);
    }
  };

  const handleAddApiConfig = async () => {
    if (!newConfig.name || !newConfig.api_key || !newConfig.api_base || !newConfig.model_name) {
      setError('请填写所有字段');
      return;
    }
    try {
      await axios.post('/api/api-configs', newConfig);
      setNewConfig({ name: '', api_key: '', api_base: '', model_name: '' });
      setShowAddForm(false);
      loadApiConfigs();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || '添加失败');
    }
  };

  const handleActivateConfig = async (configId: string) => {
    try {
      await axios.post(`/api/api-configs/${configId}/activate`);
      loadApiConfigs();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || '激活失败');
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!window.confirm('确定要删除这个API配置吗？')) return;
    try {
      await axios.delete(`/api/api-configs/${configId}`);
      loadApiConfigs();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || '删除失败');
    }
  };

  const loadQuarkConfig = async () => {
    try {
      const response = await quarkApi.getConfig();
      setQuarkConfig(response.data);
    } catch (err) {
      console.error('Failed to load Quark config:', err);
    }
  };

  const handleSaveQuarkCookie = async () => {
    if (!quarkCookie.trim()) {
      setError('请输入 Cookie');
      return;
    }
    setQuarkSaving(true);
    setError('');
    try {
      await quarkApi.setCookie(quarkCookie);
      setQuarkCookie('');
      await loadQuarkConfig();
      alert('Cookie 保存成功！');
    } catch (err: unknown) {
      console.error('Failed to save Quark cookie:', err);
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || '保存 Cookie 失败');
    } finally {
      setQuarkSaving(false);
    }
  };

  const handleClearQuarkCookie = async () => {
    if (!window.confirm('确定要清除夸克网盘 Cookie 吗？')) return;
    try {
      await quarkApi.clearCookie();
      await loadQuarkConfig();
      setQuarkTestResult(null);
    } catch (err) {
      console.error('Failed to clear Quark cookie:', err);
      setError('清除 Cookie 失败');
    }
  };

  const handleTestQuarkConnection = async () => {
    setQuarkTesting(true);
    setQuarkTestResult(null);
    try {
      const response = await quarkApi.testConnection();
      setQuarkTestResult({
        success: response.data.success,
        message: response.data.message,
      });
    } catch (err: unknown) {
      console.error('Failed to test Quark connection:', err);
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setQuarkTestResult({
        success: false,
        message: axiosErr.response?.data?.detail || '连接测试失败',
      });
    } finally {
      setQuarkTesting(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await axios.get('/api/settings');
      setSettings(response.data);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('加载设置失败');
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const response = await axios.get('/api/settings/models');
      setModels(response.data.models);
    } catch (err: unknown) {
      console.error('Failed to load models:', err);
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await axios.put('/api/settings', {
        api_key: fullApiKey || undefined,
        api_base: settings.api_base,
        model_name: settings.model_name,
        ai_backend_type: settings.ai_backend_type,
        opencode_cli_path: settings.opencode_cli_path,
        framework_prompt: settings.framework_prompt,
        explain_prompt: settings.explain_prompt,
        optimize_prompt: settings.optimize_prompt,
        quick_note_polish_prompt: settings.quick_note_polish_prompt,
        chapter_note_system_prompt: settings.chapter_note_system_prompt,
        chapter_note_prompt: settings.chapter_note_prompt,
        timeline_prompt: settings.timeline_prompt,
        batch_upload_size: settings.batch_upload_size,
        neo4j_enabled: settings.neo4j_enabled,
        neo4j_uri: settings.neo4j_uri,
        neo4j_user: settings.neo4j_user,
        neo4j_password: settings.neo4j_password,
        kg_concept_prompt: settings.kg_concept_prompt,
        quick_summary_prompt: settings.quick_summary_prompt,
      });
      alert('设置保存成功！用户自定义提示词将被持久化保存。');
      onClose();
    } catch (err: unknown) {
      console.error('Failed to save settings:', err);
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || '保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleResetFrameworkPrompt = () => {
    if (window.confirm('确定要恢复框架生成提示词为默认值吗？')) {
      setSettings({ ...settings, framework_prompt: DEFAULT_FRAMEWORK_PROMPT });
    }
  };

  const handleResetExplainPrompt = () => {
    if (window.confirm('确定要恢复AI解释提示词为默认值吗？')) {
      setSettings({ ...settings, explain_prompt: DEFAULT_EXPLAIN_PROMPT });
    }
  };

  const handleResetOptimizePrompt = () => {
    if (window.confirm('确定要恢复段落优化提示词为默认值吗？')) {
      setSettings({ ...settings, optimize_prompt: DEFAULT_OPTIMIZE_PROMPT });
    }
  };

  const handleResetQuickNotePolishPrompt = () => {
    if (window.confirm('确定要恢复快速笔记润色提示词为默认值吗？')) {
      setSettings({ ...settings, quick_note_polish_prompt: DEFAULT_QUICK_NOTE_POLISH_PROMPT });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <h2>
          <Settings size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          系统设置
        </h2>

        {error && (
          <div style={{ background: '#f8d7da', color: '#721c24', padding: 10, borderRadius: 4, marginBottom: 15 }}>
            {error}
          </div>
        )}

        <div className="settings-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #e9ecef', paddingBottom: 12, flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'api-configs' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('api-configs')}
            style={{ flex: 1, minWidth: 100 }}
          >
            API 配置管理
          </button>
          <button
            className={`btn ${activeTab === 'api' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('api')}
            style={{ flex: 1, minWidth: 100 }}
          >
            默认设置
          </button>
          <button
            className={`btn ${activeTab === 'prompts' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('prompts')}
            style={{ flex: 1, minWidth: 100 }}
          >
            提示词设置
          </button>
          <button
            className={`btn ${activeTab === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('batch')}
            style={{ flex: 1 }}
          >
            批次设置
          </button>
          <button
            className={`btn ${activeTab === 'quark' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('quark')}
            style={{ flex: 1 }}
          >
            <Cloud size={14} style={{ marginRight: 4 }} />
            夸克网盘
          </button>
          <button
            className={`btn ${activeTab === 'duplicates' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('duplicates')}
            style={{ flex: 1 }}
          >
            <Copy size={14} style={{ marginRight: 4 }} />
            重复检测
          </button>
          <button
            className={`btn ${activeTab === 'neo4j' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('neo4j')}
            style={{ flex: 1 }}
          >
            <Database size={14} style={{ marginRight: 4 }} />
            知识图谱
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', paddingRight: 8 }}>
          {activeTab === 'api-configs' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ marginBottom: 12, color: 'var(--text-primary)' }}>API 配置列表</h4>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                  管理多个API配置，勾选激活要使用的配置。激活的配置将用于所有AI调用。
                </p>
                
                {apiConfigs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 8 }}>
                    暂无API配置，请添加一个
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {apiConfigs.map((config) => (
                      <div 
                        key={config.id}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 12,
                          padding: 16,
                          background: config.is_active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                          border: config.is_active ? '2px solid var(--primary-500)' : '1px solid var(--border-default)',
                          borderRadius: 8,
                          cursor: 'pointer',
                        }}
                        onClick={() => handleActivateConfig(config.id)}
                      >
                        <input
                          type="radio"
                          checked={config.is_active}
                          onChange={() => handleActivateConfig(config.id)}
                          style={{ width: 18, height: 18, cursor: 'pointer' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                            {config.name}
                            {config.is_active && <span style={{ marginLeft: 8, color: 'var(--primary-500)', fontSize: 12 }}>● 使用中</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            <div>API: {config.api_base}</div>
                            <div>模型: {config.model_name}</div>
                            <div>Key: {config.api_key.substring(0, 8)}...{config.api_key.substring(config.api_key.length - 4)}</div>
                          </div>
                        </div>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConfig(config.id);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>添加新配置</h4>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowAddForm(!showAddForm)}
                  >
                    {showAddForm ? '取消' : '+ 添加配置'}
                  </button>
                </div>

                {showAddForm && (
                  <div style={{ background: 'var(--bg-surface)', padding: 16, borderRadius: 8, border: '1px solid var(--border-default)' }}>
                    <div className="form-group">
                      <label>配置名称</label>
                      <input
                        type="text"
                        className="input"
                        value={newConfig.name}
                        onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
                        placeholder="例如：星火API、New API..."
                      />
                    </div>
                    <div className="form-group">
                      <label>API Key</label>
                      <input
                        type="password"
                        className="input"
                        value={newConfig.api_key}
                        onChange={(e) => setNewConfig({ ...newConfig, api_key: e.target.value })}
                        placeholder="输入API密钥..."
                      />
                    </div>
                    <div className="form-group">
                      <label>API Base URL</label>
                      <input
                        type="text"
                        className="input"
                        value={newConfig.api_base}
                        onChange={(e) => setNewConfig({ ...newConfig, api_base: e.target.value })}
                        placeholder="例如：https://api.openai.com/v1"
                      />
                    </div>
                    <div className="form-group">
                      <label>模型名称</label>
                      <input
                        type="text"
                        className="input"
                        value={newConfig.model_name}
                        onChange={(e) => setNewConfig({ ...newConfig, model_name: e.target.value })}
                        placeholder="例如：gpt-4, astron-code-latest"
                      />
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={handleAddApiConfig}
                      style={{ marginTop: 8 }}
                    >
                      保存配置
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'api' && (
            <>
              <div className="form-group">
                <label>API 密钥（留空则保持不变）</label>
                <input
                  type="password"
                  className="input"
                  value={fullApiKey}
                  onChange={(e) => setFullApiKey(e.target.value)}
                  placeholder="输入新的API密钥..."
                />
                <small style={{ color: '#6c757d' }}>当前: {settings.api_key}</small>
              </div>

              <div className="form-group">
                <label>API 地址</label>
                <input
                  type="text"
                  className="input"
                  value={settings.api_base}
                  onChange={(e) => setSettings({ ...settings, api_base: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div className="form-group">
                <label>
                  模型
                  <button
                    className="btn btn-secondary"
                    style={{ marginLeft: 10, padding: '4px 8px', fontSize: 12 }}
                    onClick={loadModels}
                    disabled={loadingModels}
                  >
                    <RefreshCw size={12} style={{ marginRight: 4 }} />
                    {loadingModels ? '加载中...' : '刷新列表'}
                  </button>
                </label>
                <select
                  className="input"
                  value={settings.model_name}
                  onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                >
                  <option value="">选择模型...</option>
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
                <small style={{ color: '#6c757d' }}>
                  或直接输入模型名称
                </small>
                <input
                  type="text"
                  className="input"
                  style={{ marginTop: 8 }}
                  value={settings.model_name}
                  onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                  placeholder="例如: gpt-4, gpt-3.5-turbo"
                />
              </div>

              <div className="form-group" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
                <label style={{ fontWeight: 600, marginBottom: 12, display: 'block' }}>AI 后端模式</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    className={`btn ${settings.ai_backend_type === 'api' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '12px 16px' }}
                    onClick={() => setSettings({ ...settings, ai_backend_type: 'api' })}
                  >
                    <Cloud size={16} style={{ marginRight: 8 }} />
                    API 模式
                  </button>
                  <button
                    className={`btn ${settings.ai_backend_type === 'cli' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '12px 16px' }}
                    onClick={() => setSettings({ ...settings, ai_backend_type: 'cli' })}
                  >
                    <Settings size={16} style={{ marginRight: 8 }} />
                    CLI 模式
                  </button>
                </div>
                <small style={{ color: 'var(--text-muted)', marginTop: 8, display: 'block' }}>
                  {settings.ai_backend_type === 'api' 
                    ? '使用 New API 或其他 OpenAI 兼容 API 调用 AI' 
                    : '使用本地 OpenCode CLI 调用 AI'}
                </small>
              </div>

              {settings.ai_backend_type === 'cli' && (
                <div className="form-group">
                  <label>OpenCode CLI 路径</label>
                  <input
                    type="text"
                    className="input"
                    value={settings.opencode_cli_path}
                    onChange={(e) => setSettings({ ...settings, opencode_cli_path: e.target.value })}
                    placeholder="opencode"
                  />
                  <small style={{ color: 'var(--text-muted)' }}>
                    CLI 可执行文件的路径或命令名（如果已在 PATH 中，直接输入命令名即可）
                  </small>
                </div>
              )}
            </>
          )}

          {activeTab === 'prompts' && (
            <>
              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>框架生成提示词</h4>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={handleResetFrameworkPrompt}
                  >
                    恢复默认
                  </button>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 150, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.framework_prompt}
                  onChange={(e) => setSettings({ ...settings, framework_prompt: e.target.value })}
                  placeholder="输入框架生成的提示词..."
                />
                <small style={{ color: '#6c757d' }}>
                  使用 {"{content}"} 作为原文内容的占位符
                </small>
              </div>

              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>AI解释提示词</h4>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={handleResetExplainPrompt}
                  >
                    恢复默认
                  </button>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 150, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.explain_prompt}
                  onChange={(e) => setSettings({ ...settings, explain_prompt: e.target.value })}
                  placeholder="输入AI解释的提示词..."
                />
                <small style={{ color: '#6c757d' }}>
                  使用 {"{keyword}"} 作为术语占位符，{"{context}"} 作为上下文占位符
                </small>
              </div>

              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>段落优化提示词</h4>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={handleResetOptimizePrompt}
                  >
                    恢复默认
                  </button>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 150, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.optimize_prompt}
                  onChange={(e) => setSettings({ ...settings, optimize_prompt: e.target.value })}
                  placeholder="输入段落优化的提示词..."
                />
                <small style={{ color: '#6c757d' }}>
                  使用 {"{paragraph}"} 作为段落的占位符
                </small>
              </div>

              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>快速笔记润色提示词</h4>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 8px', fontSize: 12 }}
                    onClick={handleResetQuickNotePolishPrompt}
                  >
                    恢复默认
                  </button>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 150, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.quick_note_polish_prompt}
                  onChange={(e) => setSettings({ ...settings, quick_note_polish_prompt: e.target.value })}
                  placeholder="输入快速笔记润色的提示词..."
                />
                <small style={{ color: '#6c757d' }}>
                  使用 {"{content}"} 作为笔记内容的占位符。AI需返回JSON格式：{"{ title, content, tags }"}
                </small>
              </div>

              {/* 章节笔记提示词 */}
              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>章节笔记系统提示词</h4>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.chapter_note_system_prompt}
                  onChange={(e) => setSettings({ ...settings, chapter_note_system_prompt: e.target.value })}
                  placeholder="输入章节笔记整理的系统提示词..."
                />
                <small style={{ color: '#6c757d' }}>
                  用于PDF书籍OCR文本整理成Markdown笔记。包含代码块识别、数学公式处理等规则。
                </small>
              </div>

              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>章节笔记用户提示词</h4>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 100, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.chapter_note_prompt}
                  onChange={(e) => setSettings({ ...settings, chapter_note_prompt: e.target.value })}
                  placeholder="输入章节笔记的用户提示词模板..."
                />
                <small style={{ color: '#6c757d' }}>
                  使用 {"{chapter_title}"} 和 {"{original_text}"} 作为占位符。
                </small>
              </div>

              {/* 时间轴提示词 */}
              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>时间轴提取提示词</h4>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 150, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.timeline_prompt}
                  onChange={(e) => setSettings({ ...settings, timeline_prompt: e.target.value })}
                  placeholder="输入时间轴事件提取的提示词..."
                />
                <small style={{ color: '#6c757d' }}>
                  使用 {"{content}"} 作为文档内容的占位符。用于从文档中提取历史事件时间点。
                </small>
              </div>

              {/* 认知链概念解释提示词 */}
              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>认知链概念解释提示词</h4>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.kg_concept_prompt}
                  onChange={(e) => setSettings({ ...settings, kg_concept_prompt: e.target.value })}
                  placeholder="输入认知链概念解释的提示词..."
                />
                <small style={{ color: '#6c757d' }}>
                  用于右键提问功能。AI需要输出JSON格式，包含 label（概念简称）、definition（定义）、domain（领域）、key_concepts（相关概念）、suggested_questions（追问建议）。
                </small>
              </div>

              {/* 快速梳理提示词 */}
              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057' }}>快速梳理提示词</h4>
                </div>
                <textarea
                  className="input"
                  style={{ minHeight: 200, fontFamily: 'monospace', fontSize: 13 }}
                  value={settings.quick_summary_prompt}
                  onChange={(e) => setSettings({ ...settings, quick_summary_prompt: e.target.value })}
                  placeholder="输入快速梳理的提示词..."
                />
                <small style={{ color: '#6c757d' }}>
                  用于右键"快速梳理"功能。AI需要输出JSON格式，包含 label（章节标题）、definition（核心概述）、key_concepts（核心概念）、structure（逻辑要点）。
                </small>
              </div>

              {/* 主题切换 */}
              <div className="prompt-section" style={{ marginBottom: 20 }}>
                <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <h4 style={{ margin: 0, color: '#495057', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Palette size={16} />
                    主题切换
                  </h4>
                </div>
                <ThemeSwitcher />
                <small style={{ color: '#6c757d', marginTop: 8, display: 'block' }}>
                  选择界面主题配色方案。
                </small>
              </div>

              <div style={{ background: '#e7f3ff', padding: 12, borderRadius: 8, marginTop: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#0066cc' }}>
                  <strong>提示：</strong>用户自定义的提示词会被持久化保存到 <code>user_settings.json</code> 文件中，即使应用更新也不会丢失。
                </p>
              </div>
            </>
          )}

          {activeTab === 'batch' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 16px 0', color: '#495057', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Settings size={18} />
                  批次上传设置
                </h4>
                
                <div className="form-group">
                  <label>批次上传数量</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input
                      type="number"
                      className="input"
                      value={settings.batch_upload_size}
                      onChange={(e) => {
                        const value = parseInt(e.target.value);
                        if (!isNaN(value) && value >= 1 && value <= 10) {
                          setSettings({ ...settings, batch_upload_size: value });
                        }
                      }}
                      min={1}
                      max={10}
                      style={{ width: 100 }}
                    />
                    <span style={{ color: '#6c757d', fontSize: 13 }}>个文档/批次</span>
                  </div>
                  <small style={{ color: '#6c757d' }}>
                    设置每次批量上传时并发处理的文档数量（范围：1-10）
                  </small>
                </div>
              </div>
            </>
          )}

          {activeTab === 'quark' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#495057', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cloud size={18} />
                  夸克网盘配置
                </h4>
                
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ 
                    flex: 1, 
                    padding: 12, 
                    borderRadius: 8, 
                    background: quarkConfig.cli_available ? '#d4edda' : '#f8d7da',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    {quarkConfig.cli_available ? (
                      <>
                        <CheckCircle size={18} color="#155724" />
                        <span style={{ color: '#155724' }}>CLI 工具可用</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={18} color="#721c24" />
                        <span style={{ color: '#721c24' }}>CLI 工具未找到</span>
                      </>
                    )}
                  </div>
                  
                  <div style={{ 
                    flex: 1, 
                    padding: 12, 
                    borderRadius: 8, 
                    background: quarkConfig.has_cookie ? '#d4edda' : '#fff3cd',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    {quarkConfig.has_cookie ? (
                      <>
                        <CheckCircle size={18} color="#155724" />
                        <span style={{ color: '#155724' }}>已配置 Cookie</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={18} color="#856404" />
                        <span style={{ color: '#856404' }}>未配置 Cookie</span>
                      </>
                    )}
                  </div>
                </div>

                {!quarkConfig.cli_available && (
                  <div style={{ background: '#fff3cd', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#856404' }}>
                      <strong>请先下载 kuake CLI 工具：</strong>
                    </p>
                    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#856404' }}>
                      <li>访问 <a href="https://github.com/zhangjingwei/kuake_sdk/releases" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>GitHub Releases <ExternalLink size={12} style={{ verticalAlign: 'middle' }} /></a></li>
                      <li>下载 Windows 版本 (kuake-v*-windows-amd64.exe)</li>
                      <li>将文件重命名为 <code>kuake.exe</code></li>
                      <li>放置到项目的 <code>backend/tools/</code> 目录下</li>
                    </ol>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>夸克网盘 Cookie</label>
                <textarea
                  className="input"
                  style={{ minHeight: 80, fontFamily: 'monospace', fontSize: 12 }}
                  value={quarkCookie}
                  onChange={(e) => setQuarkCookie(e.target.value)}
                  placeholder="粘贴从浏览器复制的完整 Cookie..."
                />
                <small style={{ color: '#6c757d' }}>
                  获取方法：登录夸克网盘 → F12 打开开发者工具 → Network → 复制任意请求的 Cookie 值
                </small>
              </div>

              {quarkConfig.cookie_preview && (
                <div style={{ marginBottom: 16 }}>
                  <small style={{ color: '#6c757d' }}>当前 Cookie: </small>
                  <code style={{ fontSize: 11, background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
                    {quarkConfig.cookie_preview}
                  </code>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveQuarkCookie}
                  disabled={quarkSaving || !quarkCookie.trim()}
                >
                  {quarkSaving ? '保存中...' : '保存 Cookie'}
                </button>
                {quarkConfig.has_cookie && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleClearQuarkCookie}
                  >
                    清除 Cookie
                  </button>
                )}
              </div>

              {quarkConfig.has_cookie && (
                <div style={{ marginTop: 16 }}>
                  <button
                    className="btn btn-secondary"
                    onClick={handleTestQuarkConnection}
                    disabled={quarkTesting}
                  >
                    {quarkTesting ? (
                      <>
                        <Loader2 size={14} className="spinning" style={{ marginRight: 4 }} />
                        测试中...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={14} style={{ marginRight: 4 }} />
                        测试连接
                      </>
                    )}
                  </button>

                  {quarkTestResult && (
                    <div style={{ 
                      marginTop: 12, 
                      padding: 12, 
                      borderRadius: 8, 
                      background: quarkTestResult.success ? '#d4edda' : '#f8d7da',
                      color: quarkTestResult.success ? '#155724' : '#721c24'
                    }}>
                      {quarkTestResult.success ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckCircle size={16} />
                          {quarkTestResult.message}
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <XCircle size={16} />
                          {quarkTestResult.message}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div style={{ background: '#e7f3ff', padding: 12, borderRadius: 8, marginTop: 16 }}>
                <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#0066cc' }}>
                  <strong>使用说明：</strong>
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#0066cc' }}>
                  <li>配置 Cookie 后，可在书籍管理页面将书籍上传到夸克网盘</li>
                  <li>上传成功后会自动生成分享链接并保存</li>
                  <li>Cookie 有效期有限，过期后需重新获取</li>
                </ul>
              </div>
            </>
          )}

          {activeTab === 'duplicates' && (
            <DuplicateManager />
          )}

          {activeTab === 'neo4j' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database size={18} />
                  Neo4j 知识图谱配置
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                  配置 Neo4j 图数据库连接，启用知识图谱和认知链功能。
                  推荐使用 Docker 启动：<code style={{ background: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>docker compose up -d neo4j</code>
                </p>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.neo4j_enabled}
                      onChange={(e) => setSettings({ ...settings, neo4j_enabled: e.target.checked })}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>启用 Neo4j 知识图谱</span>
                  </label>
                  <small style={{ color: 'var(--text-muted)', marginLeft: 26 }}>
                    启用后可在文档三面板中使用「问答」和「知识图谱」功能
                  </small>
                </div>

                {settings.neo4j_enabled && (
                  <div style={{ background: 'var(--bg-surface)', padding: 16, borderRadius: 8, border: '1px solid var(--border-default)' }}>
                    <div className="form-group">
                      <label>连接 URI</label>
                      <input
                        type="text"
                        className="input"
                        value={settings.neo4j_uri}
                        onChange={(e) => setSettings({ ...settings, neo4j_uri: e.target.value })}
                        placeholder="bolt://localhost:7687"
                      />
                      <small style={{ color: 'var(--text-muted)' }}>
                        Docker 默认: bolt://localhost:7687 | Aura 云端: neo4j+s://xxxxx.databases.neo4j.io
                      </small>
                    </div>

                    <div className="form-group">
                      <label>用户名</label>
                      <input
                        type="text"
                        className="input"
                        value={settings.neo4j_user}
                        onChange={(e) => setSettings({ ...settings, neo4j_user: e.target.value })}
                        placeholder="neo4j"
                      />
                    </div>

                    <div className="form-group">
                      <label>密码</label>
                      <input
                        type="password"
                        className="input"
                        value={settings.neo4j_password}
                        onChange={(e) => setSettings({ ...settings, neo4j_password: e.target.value })}
                        placeholder="输入 Neo4j 密码"
                      />
                      <small style={{ color: 'var(--text-muted)' }}>
                        Docker 默认密码: password123
                      </small>
                    </div>

                    <div style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 8, marginTop: 8 }}>
                      <p style={{ margin: '0 0 8px 0', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        快速启动 Neo4j (Docker)
                      </p>
                      <code style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: 8, borderRadius: 4, fontFamily: 'monospace' }}>
                        docker compose up -d neo4j
                      </code>
                      <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        启动后访问 <a href="http://localhost:7474" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-500)' }}>http://localhost:7474</a> 查看 Neo4j 浏览器
                      </p>
                    </div>
                  </div>
                )}

                {!settings.neo4j_enabled && (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 8, marginTop: 12 }}>
                    <Database size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                    <p style={{ margin: 0 }}>知识图谱功能未启用</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>勾选上方开关以启用</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 16, borderTop: '1px solid #e9ecef', paddingTop: 16 }}>
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
