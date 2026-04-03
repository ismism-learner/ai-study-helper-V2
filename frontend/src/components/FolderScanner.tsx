import React, { useState, useEffect } from 'react';
import { Country, Category } from '../types';
import { libraryApi, countryApi, categoryApi } from '../api';
import { FolderOpen, Check, Loader2, CheckSquare, Square, ArrowRight, MapPin, Tag } from 'lucide-react';

interface ScannedFile {
  file_name: string;
  file_path: string;
  file_size: number;
  parsed_title: string;
  parsed_author: string | null;
  already_exists: boolean;
  existing_book_id: string | null;
}

interface ScanResult {
  total_files: number;
  new_files: number;
  existing_files: number;
  files: ScannedFile[];
}

interface FolderScannerProps {
  onImportComplete?: () => void;
}

const FolderScanner: React.FC<FolderScannerProps> = ({ onImportComplete }) => {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [defaultCountry, setDefaultCountry] = useState<string>('');
  const [defaultCategory, setDefaultCategory] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      const [countriesRes, categoriesRes] = await Promise.all([
        countryApi.list(),
        categoryApi.list()
      ]);
      setCountries(countriesRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      console.error('Failed to load metadata:', error);
    }
  };

  const scanFolder = async () => {
    setIsLoading(true);
    try {
      console.log('Scanning folder...');
      const response = await libraryApi.get<ScanResult>('/scan-folder');
      console.log('Scan result:', response.data);
      setScanResult(response.data);
      
      const newFileSet = new Set<string>();
      response.data.files.forEach(f => {
        if (!f.already_exists) {
          newFileSet.add(f.file_path);
        }
      });
      setSelectedFiles(newFileSet);
      console.log('New files to import:', newFileSet.size);
    } catch (error) {
      console.error('Failed to scan folder:', error);
      alert('扫描文件夹失败，请检查后端服务是否正常运行');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFileSelection = (filePath: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(filePath)) {
      newSelected.delete(filePath);
    } else {
      newSelected.add(filePath);
    }
    setSelectedFiles(newSelected);
  };

  const selectAllNew = () => {
    if (!scanResult) return;
    const newFileSet = new Set<string>();
    scanResult.files.forEach(f => {
      if (!f.already_exists) {
        newFileSet.add(f.file_path);
      }
    });
    setSelectedFiles(newFileSet);
  };

  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleImport = async () => {
    if (selectedFiles.size === 0) {
      alert('请先选择要导入的文件');
      return;
    }

    setImporting(true);
    setImportedCount(0);
    
    console.log('Starting import for', selectedFiles.size, 'files');

    const filesToImport = Array.from(selectedFiles).map(filePath => {
      const file = scanResult?.files.find(f => f.file_path === filePath);
      return {
        file_path: filePath,
        title: file?.parsed_title,
        author: file?.parsed_author,
        country_id: defaultCountry || undefined,
        category_id: defaultCategory || undefined,
        content_region_id: defaultCountry || undefined,
        author_region_id: defaultCountry || undefined,
      };
    });

    try {
      console.log('Sending import request with', filesToImport.length, 'files');
      const response = await libraryApi.post('/batch-import', { files: filesToImport });
      console.log('Import response:', response.data);
      setImportedCount(response.data.length);
      
      if (onImportComplete) {
        onImportComplete();
      }
      
      // 重新扫描以更新状态
      await scanFolder();
    } catch (error: any) {
      console.error('Failed to import files:', error);
      alert('导入失败: ' + (error.response?.data?.detail || error.message));
    } finally {
      setImporting(false);
    }
  };

  const newFiles = scanResult?.files.filter(f => !f.already_exists) || [];
  const existingFiles = scanResult?.files.filter(f => f.already_exists) || [];

  return (
    <div className="folder-scanner">
      <div className="scanner-header">
        <div className="header-title">
          <FolderOpen size={24} />
          <h2>文件夹扫描</h2>
        </div>
      </div>

      <div className="scanner-info">
        <p>将PDF文件直接复制到 <code>uploads/books</code> 文件夹，然后点击下方"扫描文件夹"按钮即可自动识别并导入。</p>
      </div>

      {isLoading ? (
        <div className="scanner-loading">
          <Loader2 size={32} className="spin" />
          <p>正在扫描文件夹...</p>
        </div>
      ) : (
        <>
          {scanResult && (
            <div className="scan-summary">
              <div className="summary-item">
                <span className="summary-value">{scanResult.total_files}</span>
                <span className="summary-label">总文件数</span>
              </div>
              <div className="summary-item new">
                <span className="summary-value">{scanResult.new_files}</span>
                <span className="summary-label">待导入</span>
              </div>
              <div className="summary-item existing">
                <span className="summary-value">{scanResult.existing_files}</span>
                <span className="summary-label">已存在</span>
              </div>
            </div>
          )}

          <div className="import-settings">
              <h3>批量导入设置</h3>
              <div className="settings-row">
                <div className="setting-item">
                  <label>
                    <MapPin size={14} />
                    默认国家/地区
                  </label>
                  <select
                    value={defaultCountry}
                    onChange={(e) => setDefaultCountry(e.target.value)}
                  >
                    <option value="">不设置</option>
                    {countries.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="setting-item">
                  <label>
                    <Tag size={14} />
                    默认分类
                  </label>
                  <select
                    value={defaultCategory}
                    onChange={(e) => setDefaultCategory(e.target.value)}
                  >
                    <option value="">不设置</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="selection-actions">
                <button 
                  className="btn btn-primary" 
                  onClick={scanFolder}
                  disabled={isLoading}
                  style={{ marginRight: 'auto' }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      扫描中...
                    </>
                  ) : (
                    <>
                      <FolderOpen size={16} />
                      扫描文件夹
                    </>
                  )}
                </button>
                {newFiles.length > 0 && (
                  <>
                    <button className="btn-link" onClick={selectAllNew}>
                      <CheckSquare size={14} />
                      全选待导入
                    </button>
                    <button className="btn-link" onClick={deselectAll}>
                      <Square size={14} />
                      取消全选
                    </button>
                    <span className="selected-count">
                      已选择 {selectedFiles.size} 个文件
                    </span>
                  </>
                )}
              </div>
            </div>

          {newFiles.length > 0 && (
            <div className="file-section">
              <h3>待导入文件 ({newFiles.length})</h3>
              <p style={{ fontSize: 12, color: '#6c757d', marginBottom: 8 }}>
                点击文件可选中/取消选中，选中后点击底部"导入选中文件"按钮完成导入
              </p>
              <div className="file-list">
                {newFiles.map((file, index) => (
                  <div
                    key={index}
                    className={`file-item ${selectedFiles.has(file.file_path) ? 'selected' : ''}`}
                    onClick={() => toggleFileSelection(file.file_path)}
                  >
                    <div className="file-checkbox">
                      {selectedFiles.has(file.file_path) ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} />
                      )}
                    </div>
                    <div className="file-info">
                      <span className="file-title">{file.parsed_title}</span>
                      {file.parsed_author && (
                        <span className="file-author">作者: {file.parsed_author}</span>
                      )}
                      <span className="file-name">{file.file_name}</span>
                    </div>
                    <div className="file-meta">
                      <span className="file-size">{formatFileSize(file.file_size)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {existingFiles.length > 0 && (
            <div className="file-section existing">
              <h3>已存在文件 ({existingFiles.length})</h3>
              <div className="file-list">
                {existingFiles.map((file, index) => (
                  <div key={index} className="file-item existing">
                    <div className="file-checkbox">
                      <Check size={18} />
                    </div>
                    <div className="file-info">
                      <span className="file-title">{file.parsed_title}</span>
                      {file.parsed_author && (
                        <span className="file-author">作者: {file.parsed_author}</span>
                      )}
                    </div>
                    <div className="file-meta">
                      <span className="file-status">已导入</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {newFiles.length > 0 && (
            <div className="import-actions" style={{ 
              position: 'sticky', 
              bottom: 0, 
              background: 'white', 
              padding: '16px 0',
              borderTop: '2px solid #e9ecef',
              marginTop: '16px'
            }}>
              <div style={{ marginBottom: 8, fontSize: 13, color: '#495057' }}>
                已选择 {selectedFiles.size} 个文件
                {selectedFiles.size === 0 && (
                  <span style={{ color: '#dc3545' }}> - 请先点击上方文件进行选择</span>
                )}
              </div>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={selectedFiles.size === 0 || importing}
                style={{ 
                  opacity: selectedFiles.size === 0 ? 0.5 : 1,
                  minWidth: 200
                }}
              >
                {importing ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <ArrowRight size={16} />
                    导入选中文件 ({selectedFiles.size})
                  </>
                )}
              </button>
              {importedCount > 0 && (
                <span className="import-success" style={{ marginLeft: 16 }}>
                  ✓ 成功导入 {importedCount} 个文件
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FolderScanner;
