import React, { useState, useEffect } from 'react';
import { Palette, Check } from 'lucide-react';

interface Theme {
  id: string;
  name: string;
  preview: {
    bg: string;
    accent: string;
    text: string;
  };
}

const themes: Theme[] = [
  {
    id: 'default',
    name: '蓝黑主题',
    preview: { bg: '#0a0a1a', accent: '#3b82f6', text: '#ffffff' }
  },
  {
    id: 'red-dark',
    name: '红黑主题',
    preview: { bg: '#0a0a0a', accent: '#ef4444', text: '#ffffff' }
  },
  {
    id: 'green-dark',
    name: '绿黑主题',
    preview: { bg: '#0a0f0a', accent: '#22c55e', text: '#ffffff' }
  },
  {
    id: 'purple-dark',
    name: '紫黑主题',
    preview: { bg: '#0f0a1a', accent: '#8b5cf6', text: '#ffffff' }
  },
  {
    id: 'light-blue',
    name: '白蓝主题',
    preview: { bg: '#ffffff', accent: '#3b82f6', text: '#0f172a' }
  },
];

interface ThemeSwitcherProps {
  className?: string;
}

const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('default');

  useEffect(() => {
    // 从 localStorage 读取保存的主题
    const savedTheme = localStorage.getItem('theme') || 'default';
    applyTheme(savedTheme);
    setCurrentTheme(savedTheme);
  }, []);

  const applyTheme = (themeId: string) => {
    const root = document.documentElement;
    
    // 移除所有主题类
    root.removeAttribute('data-theme');
    
    // 应用新主题
    if (themeId !== 'default') {
      root.setAttribute('data-theme', themeId);
    }
    
    // 保存到 localStorage
    localStorage.setItem('theme', themeId);
  };

  const handleThemeChange = (themeId: string) => {
    applyTheme(themeId);
    setCurrentTheme(themeId);
    setIsOpen(false);
  };

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

export default ThemeSwitcher;
