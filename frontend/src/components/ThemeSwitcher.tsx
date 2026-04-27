import React, { useState, useEffect } from 'react';
import { Check, Palette } from 'lucide-react';

interface Theme {
  id: string;
  name: string;
  preview: {
    bg: string;
    accent: string;
  };
}

const themes: Theme[] = [
  {
    id: 'default',
    name: '蓝黑主题',
    preview: { bg: '#1a1f2e', accent: '#4f8ef7' }
  },
  {
    id: 'red-dark',
    name: '红黑主题',
    preview: { bg: '#1c1212', accent: '#ef4444' }
  },
  {
    id: 'green-dark',
    name: '绿黑主题',
    preview: { bg: '#121a14', accent: '#22c55e' }
  },
  {
    id: 'purple-dark',
    name: '紫黑主题',
    preview: { bg: '#0f0a1a', accent: '#a78bfa' }
  },
  {
    id: 'light-blue',
    name: '白蓝主题',
    preview: { bg: '#f0f4f8', accent: '#3b82f6' }
  },
  {
    id: 'sanxiang',
    name: '三相笔记',
    preview: { bg: '#f5f0e8', accent: '#8B7EC8' }
  },
];

interface ThemeSwitcherProps {
  className?: string;
  inline?: boolean;
}

const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ className = '', inline = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('default');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'default';
    applyTheme(savedTheme);
    setCurrentTheme(savedTheme);
  }, []);

  const applyTheme = (themeId: string) => {
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    if (themeId !== 'default') {
      root.setAttribute('data-theme', themeId);
    }
    localStorage.setItem('theme', themeId);
  };

  const handleThemeChange = (themeId: string) => {
    applyTheme(themeId);
    setCurrentTheme(themeId);
    setIsOpen(false);
  };

  if (inline) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {themes.map((theme) => (
          <button
            key={theme.id}
            onClick={() => handleThemeChange(theme.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              background: currentTheme === theme.id ? 'var(--bg-elevated)' : 'var(--bg-surface)',
              border: currentTheme === theme.id ? '2px solid var(--primary-500)' : '1px solid var(--border-default)',
              borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: theme.preview.bg,
              border: `2px solid ${theme.preview.accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: theme.preview.accent,
              }} />
            </div>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{theme.name}</span>
            {currentTheme === theme.id && (
              <Check size={14} style={{ color: 'var(--primary-500)' }} />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`theme-switcher ${className}`}>
      <button
        className="theme-switcher-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="切换主题"
      >
        <Palette size={18} />
      </button>
      
      {isOpen && (
        <>
          <div 
            className="theme-switcher-backdrop" 
            onClick={() => setIsOpen(false)}
          />
          <div className="theme-switcher-dropdown">
            <div className="theme-switcher-header">
              <Palette size={16} />
              <span>选择主题</span>
            </div>
            <div className="theme-switcher-list">
              {themes.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-switcher-item ${currentTheme === theme.id ? 'active' : ''}`}
                  onClick={() => handleThemeChange(theme.id)}
                >
                  <div 
                    className="theme-preview"
                    style={{ 
                      background: theme.preview.bg,
                      borderColor: theme.preview.accent
                    }}
                  >
                    <div 
                      className="theme-preview-accent"
                      style={{ background: theme.preview.accent }}
                    />
                  </div>
                  <span className="theme-name">{theme.name}</span>
                  {currentTheme === theme.id && (
                    <Check size={16} className="theme-check" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default React.memo(ThemeSwitcher);
