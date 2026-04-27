export const tagLibraryStyles = `
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .tag-library-scroll.sel-mode {
    user-select: none;
    cursor: crosshair;
  }

  .taglib-book-card {
    display: flex !important;
    flex-direction: column;
    width: 175px;
    background: #fff;
    border: 2px solid #e5e7eb;
    border-radius: 14px;
    overflow: visible !important;
    cursor: pointer;
    transition: all 0.18s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    position: relative;
  }
  .taglib-book-card:hover {
    border-color: #93c5fd;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    transform: translateY(-2px);
  }

  .taglib-book-card.taglib-selected {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.2), 0 4px 16px rgba(37,99,235,0.25);
    transform: translateY(-1px);
  }
  .taglib-book-card.taglib-selected:hover {
    box-shadow: 0 0 0 3px rgba(37,99,235,0.3), 0 6px 20px rgba(37,99,235,0.35);
  }

  .taglib-select-check {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 10;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(4px);
    border: 1.5px solid #2563eb;
    color: #2563eb;
    box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    transition: all 0.15s ease;
  }
  .taglib-book-card:not(.taglib-selected) .taglib-select-check {
    border-color: #d1d5db;
    color: #9ca3af;
    background: rgba(255,255,255,0.85);
  }

  .taglib-cover-area {
    width: 100%;
    aspect-ratio: 3 / 4;
    background: #dc2626;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    position: relative;
    border-radius: 12px 12px 0 0;
  }
  .taglib-cover-area img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .taglib-cover-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgba(255,255,255,0.75);
    padding: 14px;
    text-align: center;
  }
  .taglib-cover-placeholder svg { opacity: 0.65; }
  .taglib-cover-title {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.35;
    max-width: 90%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .taglib-author-bar {
    width: 100%;
    padding: 7px 10px;
    background: #6b7280;
    color: #fff;
    font-size: 11px;
    font-weight: 500;
    text-align: center;
    letter-spacing: 0.3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .taglib-bottom-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 10px;
    background: #fafafa;
    border-radius: 0 0 12px 12px;
  }

  .taglib-tags-area {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: flex-start;
  }

  .taglib-tag-chip {
    font-size: 11px;
    padding: 2px 7px;
    background: #b45309;
    color: #fff;
    border-radius: 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    line-height: 1.6;
    transition: all 0.15s ease;
    max-width: 100%;
    white-space: nowrap;
  }
  .taglib-tag-chip svg { flex-shrink: 0; opacity: 0.7; transition: opacity 0.15s; }
  .taglib-tag-chip:hover {
    background: #92400e;
    box-shadow: 0 1px 4px rgba(180,83,9,0.35);
  }
  .taglib-tag-chip:hover svg { opacity: 1; }

  .taglib-more-tags {
    font-size: 10px;
    color: #9ca3af;
    font-style: italic;
    padding: 2px 4px;
  }

  .taglib-no-tag {
    font-size: 11px;
    color: #9ca3af;
    font-style: italic;
  }

  .taglib-context-menu {
    min-width: 240px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
    padding: 6px;
    animation: cmFadeIn 0.12s ease-out;
  }
  @keyframes cmFadeIn {
    from { opacity: 0; transform: scale(0.95) translateY(-4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .taglib-cm-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    font-size: 12px;
    font-weight: 600;
    color: #2563eb;
  }

  .taglib-cm-divider {
    height: 1px;
    background: #f3f4f6;
    margin: 4px 0;
  }

  .taglib-cm-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    color: #374151;
    text-align: left;
    transition: all 0.12s ease;
  }
  .taglib-cm-item:hover {
    background: #f3f4f6;
  }
  .taglib-cm-item-primary:hover {
    background: #eff6ff;
    color: #1d4ed8;
  }
  .taglib-cm-item-danger:hover {
    background: #fef2f2;
    color: #dc2626;
  }

  .taglib-cm-hint {
    margin-left: auto;
    font-size: 10px;
    color: #9ca3af;
    font-weight: 400;
  }

  .taglib-cm-tag-panel {
    margin-top: 6px;
    padding: 10px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .taglib-cm-tag-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #1e40af;
    margin-bottom: 8px;
  }
  .taglib-cm-tag-input-row {
    margin-bottom: 8px;
  }
  .taglib-cm-tag-input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 12px;
    background: #fff;
  }
  .taglib-cm-tag-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
  .taglib-cm-tag-section {
    margin-bottom: 8px;
  }
  .taglib-cm-tag-section-label {
    font-size: 10px;
    color: #6b7280;
    margin-bottom: 4px;
  }
  .taglib-cm-tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    max-height: 160px;
    overflow-y: auto;
  }
  .taglib-cm-tag-empty {
    font-size: 11px;
    color: #9ca3af;
    font-style: italic;
    padding: 8px 4px;
  }
  .taglib-cm-tag-btn {
    font-size: 11px;
    padding: 4px 10px;
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    color: #1d4ed8;
    border: 1px solid rgba(59,130,246,0.25);
    border-radius: 7px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.12s ease;
  }
  .taglib-cm-tag-btn:hover {
    background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    transform: scale(1.04);
  }
  .taglib-cm-tag-btn-remove {
    background: linear-gradient(135deg, #fef2f2, #fee2e2);
    color: #dc2626;
    border-color: rgba(220, 38, 38, 0.25);
  }
  .taglib-cm-tag-btn-remove:hover {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
  }
  .taglib-cm-tag-btn .tag-count {
    font-size: 9px;
    opacity: 0.7;
  }
  .taglib-cm-tag-close {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    margin-top: 8px;
    padding: 5px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #fff;
    color: #6b7280;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .taglib-cm-tag-close:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .taglib-author-text {
    font-size: 11px;
    color: #6b7280;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  .taglib-cm-title-panel {
    margin-top: 6px;
    padding: 10px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }
  .taglib-cm-title-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #1e40af;
    margin-bottom: 8px;
  }
  .taglib-cm-title-input {
    width: 100%;
    padding: 7px 10px;
    border: 1.5px solid #d1d5db;
    border-radius: 7px;
    font-size: 13px;
    color: #374151;
    outline: none;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
  }
  .taglib-cm-title-input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
  }
  .taglib-cm-title-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .taglib-cm-title-save {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 12px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .taglib-cm-title-save:hover { background: #1d4ed8; }
  .taglib-cm-title-cancel {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 14px;
    background: #fff;
    color: #6b7280;
    border: 1px solid #d1d5db;
    border-radius: 7px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.12s ease;
  }
  .taglib-cm-title-cancel:hover {
    background: #f3f4f6;
    color: #374151;
  }
  .taglib-cm-title-hint {
    margin-top: 6px;
    font-size: 10px;
    color: #f59e0b;
    text-align: center;
  }

  .era-books-grid,
  .books-by-era {
    overflow: visible !important;
  }
  .era-books {
    overflow: visible !important;
  }

  .quark-modal {
    width: 500px;
    max-width: 90vw;
    background: var(--bg-white, #fff);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  }

  .quark-upload-info {
    padding: 12px;
    background: #f0f9ff;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .quark-upload-info p {
    margin: 0 0 8px 0;
    font-size: 13px;
    color: #1e40af;
  }

  .quark-upload-info p:last-child {
    margin-bottom: 0;
  }

  .quark-upload-tips {
    font-size: 12px;
    color: #6b7280;
  }

  .quark-upload-tips h4 {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 600;
  }

  .quark-upload-tips ul {
    margin: 0;
    padding-left: 16px;
  }

  .quark-upload-tips li {
    margin-bottom: 4px;
  }

  .quark-upload-results {
    max-height: 300px;
    overflow-y: auto;
  }

  .quark-result-item {
    padding: 10px;
    border-radius: 8px;
    margin-bottom: 8px;
    border: 1px solid #e5e7eb;
  }

  .quark-result-item.success {
    background: #f0fdf4;
    border-color: #86efac;
  }

  .quark-result-item.failed {
    background: #fef2f2;
    border-color: #fecaca;
  }

  .quark-result-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .quark-result-title {
    font-size: 13px;
    font-weight: 500;
  }

  .quark-result-share {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .quark-result-share a {
    font-size: 12px;
    color: #2563eb;
    text-decoration: none;
  }

  .quark-result-share a:hover {
    text-decoration: underline;
  }

  .quark-result-password {
    font-size: 11px;
    color: #6b7280;
    background: #f3f4f6;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .quark-result-error {
    font-size: 12px;
    color: #dc2626;
  }

  .tag-tabs-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 16px;
    background: var(--bg-light, #f9fafb);
    border-bottom: 1px solid var(--border-color, #e5e7eb);
    position: sticky;
    top: 0;
    z-index: 10;
    max-height: none;
    overflow: visible;
    transition: max-height 0.25s ease;
  }

  .tag-tabs-bar.collapsed {
    max-height: 46px;
    overflow: hidden;
  }

  .tag-library-scroll {
    padding: 0;
  }

  .tag-tab {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: var(--bg-white, #fff);
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 16px;
    font-size: 12px;
    color: var(--text-secondary, #6b7280);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .tag-tab:hover {
    border-color: var(--primary-color, #3b82f6);
    color: var(--primary-color, #3b82f6);
  }

  .tag-tab.active {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border-color: transparent;
    color: white;
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
  }

  .tag-bar-expand-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: transparent;
    border: none;
    border-radius: 12px;
    font-size: 11px;
    color: var(--primary-color, #3b82f6);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tag-bar-expand-btn:hover {
    background: rgba(59, 130, 246, 0.08);
  }

  .tab-count {
    font-size: 10px;
    opacity: 0.8;
    background: rgba(255,255,255,0.2);
    padding: 1px 5px;
    border-radius: 8px;
  }

  .tag-tab:not(.active) .tab-count {
    background: var(--bg-light, #f3f4f6);
    color: var(--text-muted, #9ca3af);
  }

  .tag-content-area {
    padding: 12px 0 16px 16px;
    min-height: 200px;
  }

  .tag-section {
    margin-bottom: 20px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
    margin-bottom: 12px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #111827);
  }

  .section-tag-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: linear-gradient(135deg, #10b981, #059669);
    border: none;
    border-radius: 12px;
    font-size: 11px;
    color: white;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .section-tag-btn:hover {
    transform: scale(1.02);
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
  }

  .section-count {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-secondary, #6b7280);
  }

  .section-books-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
    gap: 14px;
  }

  .empty-hint {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-muted, #9ca3af);
    font-size: 13px;
  }
`;
