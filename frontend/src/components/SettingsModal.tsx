﻿﻿﻿﻿﻿﻿﻿import React, { useState, useEffect } from 'react';
import { Settings, RefreshCw, Cloud, CheckCircle, XCircle, ExternalLink, Copy, Palette } from 'lucide-react';
import { quarkApi } from '../api';
import api from '../api/client';
import DuplicateManager from './DuplicateManager';
import ThemeSwitcher from './ThemeSwitcher';
import LoadingBook from './LoadingBook';
import '../styles/theme-switcher.css';

interface SettingsModalProps {
  onClose: () => void;
}

interface SettingsData {
  api_key: string;
  api_base: string;
  model_name: string;
  framework_prompt: string;
  explain_prompt: string;
  optimize_prompt: string;
  quick_note_polish_prompt: string;
  chapter_note_system_prompt: string;
  chapter_note_prompt: string;
  timeline_prompt: string;
  batch_upload_size: number;

  kg_concept_prompt: string;
  quick_summary_prompt: string;
  long_text_rewrite_system_prompt: string;
  long_text_rewrite_prompt: string;
  polish_note_prompt: string;
  polish_note_system_prompt: string;
  generate_note_prompt: string;
  generate_note_system_prompt: string;
  structure_system_prompt: string;
  structure_user_prompt: string;
  section_fill_prompt: string;
  kg_concept_user_prompt: string;
}

interface QuarkConfig {
  has_cookie: boolean;
  cli_available: boolean;
  cookie_preview: string | null;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [settings, setSettings] = useState<SettingsData>({
    api_key: '',
    api_base: '',
    model_name: '',
    framework_prompt: '',
    explain_prompt: '',
    optimize_prompt: '',
    quick_note_polish_prompt: '',
    chapter_note_system_prompt: '',
    chapter_note_prompt: '',
    timeline_prompt: '',
    batch_upload_size: 5,

    kg_concept_prompt: '',
    quick_summary_prompt: '',
    long_text_rewrite_system_prompt: '',
    long_text_rewrite_prompt: '',
    polish_note_prompt: '',
    polish_note_system_prompt: '',
    generate_note_prompt: '',
    generate_note_system_prompt: '',
    structure_system_prompt: '',
    structure_user_prompt: '',
    section_fill_prompt: '',
    kg_concept_user_prompt: '',
  });
  const [fullApiKey, setFullApiKey] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'api' | 'prompts' | 'quark' | 'duplicates'>('api');
  
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
  }, []);

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
      const response = await api.get('/settings');
      setSettings(response.data);
    } catch (err) {
      console.error('Failed to load settings:', err);
      setError('加载设置失败');
    }
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const response = await api.get('/settings/models');
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
      await api.put('/settings', {
        api_key: fullApiKey || undefined,
        api_base: settings.api_base,
        model_name: settings.model_name,
        framework_prompt: settings.framework_prompt,
        explain_prompt: settings.explain_prompt,
        optimize_prompt: settings.optimize_prompt,
        quick_note_polish_prompt: settings.quick_note_polish_prompt,
        chapter_note_system_prompt: settings.chapter_note_system_prompt,
        chapter_note_prompt: settings.chapter_note_prompt,
        timeline_prompt: settings.timeline_prompt,
        batch_upload_size: settings.batch_upload_size,

        kg_concept_prompt: settings.kg_concept_prompt,
        quick_summary_prompt: settings.quick_summary_prompt,
        long_text_rewrite_system_prompt: settings.long_text_rewrite_system_prompt,
        long_text_rewrite_prompt: settings.long_text_rewrite_prompt,
        polish_note_prompt: settings.polish_note_prompt,
        polish_note_system_prompt: settings.polish_note_system_prompt,
        generate_note_prompt: settings.generate_note_prompt,
        generate_note_system_prompt: settings.generate_note_system_prompt,
        structure_system_prompt: settings.structure_system_prompt,
        structure_user_prompt: settings.structure_user_prompt,
        section_fill_prompt: settings.section_fill_prompt,
        kg_concept_user_prompt: settings.kg_concept_user_prompt,
      });
      // 保存成功后重新加载设置，确保UI与后端同步
      setFullApiKey('');
      await loadSettings();
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

  const handleResetPrompt = (_field: keyof SettingsData) => {
    if (!window.confirm('确定要恢复该提示词为默认值吗？')) return;
    loadSettings();
  };

  const renderPromptEditor = (
    label: string,
    field: keyof SettingsData,
    placeholder?: string,
    hint?: string,
    minHeight = 150,
  ) => (
    <div className="prompt-section" style={{ marginBottom: 20 }}>
      <div className="prompt-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{label}</h4>
        <button
          className="btn btn-secondary"
          style={{ padding: '4px 8px', fontSize: 12 }}
          onClick={() => handleResetPrompt(field)}
        >
          恢复默认
        </button>
      </div>
      <textarea
        className="input"
        style={{ minHeight, fontFamily: 'monospace', fontSize: 13 }}
        value={settings[field] as string}
        onChange={(e) => setSettings({ ...settings, [field]: e.target.value })}
        placeholder={placeholder}
      />
      {hint && <small style={{ color: 'var(--text-muted)' }}>{hint}</small>}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <h2>
          <Settings size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          系统设置
        </h2>

        {error && (
          <div style={{ background: 'var(--danger-light)', color: 'var(--danger-500)', padding: 10, borderRadius: 4, marginBottom: 15 }}>
            {error}
          </div>
        )}

        <div className="settings-tabs" style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-default)', paddingBottom: 12, flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'api' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('api')}
            style={{ flex: 1, minWidth: 100 }}
          >
            <Settings size={14} style={{ marginRight: 4 }} />
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

        </div>

        <div style={{ flex: 1, overflow: 'auto', paddingRight: 8 }}>
          {activeTab === 'api' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, alignItems: 'start' }}>
                <div className="form-section" style={{ background: 'var(--bg-surface)', padding: 16, borderRadius: 8, border: '1px solid var(--border-default)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: 14 }}>API 配置</h4>
                  <div className="form-group">
                    <label style={{ fontSize: 12 }}>API 密钥</label>
                    <input
                      type="password"
                      className="input"
                      value={fullApiKey}
                      onChange={(e) => setFullApiKey(e.target.value)}
                      placeholder="输入新的API密钥..."
                    />
                    <small style={{ color: 'var(--text-muted)' }}>当前: {settings.api_key}</small>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: 12 }}>API 地址</label>
                    <input
                      type="text"
                      className="input"
                      value={settings.api_base}
                      onChange={(e) => setSettings({ ...settings, api_base: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                    />
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: 12 }}>模型</label>
                    <select
                      className="input"
                      value={settings.model_name}
                      onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                    >
                      <option value="">选择模型...</option>
                      {models.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn-secondary"
                      style={{ marginTop: 4, padding: '4px 8px', fontSize: 11, width: '100%' }}
                      onClick={loadModels}
                      disabled={loadingModels}
                    >
                      <RefreshCw size={11} style={{ marginRight: 4 }} />
                      {loadingModels ? '加载中...' : '刷新模型列表'}
                    </button>
                    <input
                      type="text"
                      className="input"
                      style={{ marginTop: 8 }}
                      value={settings.model_name}
                      onChange={(e) => setSettings({ ...settings, model_name: e.target.value })}
                      placeholder="或直接输入模型名称"
                    />
                  </div>
                </div>

                <div className="form-section" style={{ background: 'var(--bg-surface)', padding: 16, borderRadius: 8, border: '1px solid var(--border-default)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: 14 }}>
                    <Palette size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    主题切换
                  </h4>
                  <ThemeSwitcher inline />
                </div>

                <div className="form-section" style={{ background: 'var(--bg-surface)', padding: 16, borderRadius: 8, border: '1px solid var(--border-default)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: 14 }}>批次设置</h4>
                  <div className="form-group">
                    <label style={{ fontSize: 12 }}>每批数量</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                        style={{ width: 80 }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>个/批</span>
                    </div>
                    <small style={{ color: 'var(--text-muted)' }}>
                      批量上传时每批并发处理的文档数（1-10）
                    </small>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'prompts' && (
            <>
              {renderPromptEditor('框架生成提示词', 'framework_prompt', '输入框架生成的提示词...',
                '使用 {"{content}"} 作为原文内容的占位符')}
              
              {renderPromptEditor('AI解释提示词', 'explain_prompt', '输入AI解释的提示词...',
                '使用 {"{keyword}"} 作为术语占位符，{"{context}"} 作为上下文占位符')}
              
              {renderPromptEditor('段落优化提示词', 'optimize_prompt', '输入段落优化的提示词...',
                '使用 {"{paragraph}"} 作为段落的占位符')}
              
              {renderPromptEditor('快速笔记润色提示词', 'quick_note_polish_prompt', '输入快速笔记润色的提示词...',
                '使用 {"{content}"} 作为笔记内容的占位符。AI需返回JSON格式：{"{ title, content, tags }"}')}
              
              {renderPromptEditor('章节笔记系统提示词', 'chapter_note_system_prompt', '输入章节笔记整理的系统提示词...',
                '用于PDF书籍OCR文本整理成Markdown笔记。包含代码块识别、数学公式处理等规则。', 200)}
              
              {renderPromptEditor('章节笔记用户提示词', 'chapter_note_prompt', '输入章节笔记的用户提示词模板...',
                '使用 {"{chapter_title}"} 和 {"{original_text}"} 作为占位符。', 100)}
              
              {renderPromptEditor('时间轴提取提示词', 'timeline_prompt', '输入时间轴事件提取的提示词...',
                '使用 {"{content}"} 作为文档内容的占位符。用于从文档中提取历史事件时间点。')}
              
              {renderPromptEditor('认知链概念解释提示词', 'kg_concept_prompt', '输入认知链概念解释的提示词...',
                '用于右键提问功能。AI需要输出JSON格式', 200)}
              
              {renderPromptEditor('快速梳理提示词', 'quick_summary_prompt', '输入快速梳理的提示词...',
                '用于右键"快速梳理"功能。AI需要输出JSON格式', 200)}
              
              {renderPromptEditor('长文本改写系统提示词', 'long_text_rewrite_system_prompt', '输入长文本改写系统提示词...',
                '用于长文本改写功能的系统提示词，定义改写风格和规则。')}
              
              {renderPromptEditor('长文本改写用户提示词', 'long_text_rewrite_prompt', '输入长文本改写用户提示词...',
                '使用 {"{original_content}"} 和 {"{section_identifier}"} 作为占位符。')}
              
              {renderPromptEditor('笔记润色提示词', 'polish_note_prompt', '输入笔记润色提示词...',
                '使用 {"{note_content}"} 作为笔记内容占位符。')}
              
              {renderPromptEditor('笔记润色系统提示词', 'polish_note_system_prompt', '输入笔记润色系统提示词...',
                '笔记润色功能的系统提示词，定义AI角色和行为。')}
              
              {renderPromptEditor('笔记生成提示词', 'generate_note_prompt', '输入笔记生成提示词...',
                '用于一键生成笔记标题和内容。AI需返回JSON格式。')}
              
              {renderPromptEditor('笔记生成系统提示词', 'generate_note_system_prompt', '输入笔记生成系统提示词...',
                '笔记生成功能的系统提示词，定义AI角色和输出格式要求。')}
              
              {renderPromptEditor('结构分析系统提示词', 'structure_system_prompt', '输入结构分析系统提示词...',
                '用于PDF书籍结构分析（第一阶段）。定义输出JSON格式和行号规则。')}
              
              {renderPromptEditor('结构分析用户提示词', 'structure_user_prompt', '输入结构分析用户提示词...',
                '使用 {"{chapter_title}"} 和 {"{numbered_text}"} 作为占位符。')}
              
              {renderPromptEditor('章节填充提示词', 'section_fill_prompt', '输入章节填充提示词...',
                '用于根据结构表填充章节内容。使用 {"{structure}"}、{"{section_title}"} 等占位符。')}
              
              {renderPromptEditor('认知链概念解释用户提示词', 'kg_concept_user_prompt', '输入认知链概念解释用户提示词...',
                '用于右键提问时构建用户消息。使用 {"{concept}"} 和 {"{context_section}"} 作为占位符。')}

              <div style={{ background: 'var(--primary-light)', padding: 12, borderRadius: 8, marginTop: 16 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--primary-500)' }}>
                  <strong>提示：</strong>用户自定义的提示词会被持久化保存到 <code>user_settings.json</code> 文件中，即使应用更新也不会丢失。
                </p>
              </div>
            </>
          )}

          {activeTab === 'quark' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cloud size={18} />
                  夸克网盘配置
                </h4>
                
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ 
                    flex: 1, 
                    padding: 12, 
                    borderRadius: 8, 
                    background: quarkConfig.cli_available ? 'var(--success-light)' : 'var(--danger-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    {quarkConfig.cli_available ? (
                      <>
                        <CheckCircle size={18} color="var(--success-500)" />
                        <span style={{ color: 'var(--success-500)' }}>CLI 工具可用</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={18} color="var(--danger-500)" />
                        <span style={{ color: 'var(--danger-500)' }}>CLI 工具未找到</span>
                      </>
                    )}
                  </div>
                  
                  <div style={{ 
                    flex: 1, 
                    padding: 12, 
                    borderRadius: 8, 
                    background: quarkConfig.has_cookie ? 'var(--success-light)' : 'var(--warning-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    {quarkConfig.has_cookie ? (
                      <>
                        <CheckCircle size={18} color="var(--success-500)" />
                        <span style={{ color: 'var(--success-500)' }}>已配置 Cookie</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={18} color="var(--warning-500)" />
                        <span style={{ color: 'var(--warning-500)' }}>未配置 Cookie</span>
                      </>
                    )}
                  </div>
                </div>

                {!quarkConfig.cli_available && (
                  <div style={{ background: 'var(--warning-light)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                    <p style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--warning-500)' }}>
                      <strong>请先下载 kuake CLI 工具：</strong>
                    </p>
                    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--warning-500)' }}>
                      <li>访问 <a href="https://github.com/zhangjingwei/kuake_sdk/releases" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-500)' }}>GitHub Releases <ExternalLink size={12} style={{ verticalAlign: 'middle' }} /></a></li>
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
                <small style={{ color: 'var(--text-muted)' }}>
                  获取方法：登录夸克网盘 → F12 打开开发者工具 → Network → 复制任意请求的 Cookie 值
                </small>
              </div>

              {quarkConfig.cookie_preview && (
                <div style={{ marginBottom: 16 }}>
                  <small style={{ color: 'var(--text-muted)' }}>当前 Cookie: </small>
                  <code style={{ fontSize: 11, background: 'var(--bg-muted)', padding: '2px 6px', borderRadius: 4 }}>
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
                        <LoadingBook size={14} />
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
                      background: quarkTestResult.success ? 'var(--success-light)' : 'var(--danger-light)',
                      color: quarkTestResult.success ? 'var(--success-500)' : 'var(--danger-500)'
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

              <div style={{ background: 'var(--primary-light)', padding: 12, borderRadius: 8, marginTop: 16 }}>
                <p style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--primary-500)' }}>
                  <strong>使用说明：</strong>
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--primary-500)' }}>
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


        </div>

        <div className="modal-actions" style={{ marginTop: 16, borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
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