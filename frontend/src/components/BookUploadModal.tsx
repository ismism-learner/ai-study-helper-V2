import React, { useState, useEffect, useRef } from 'react';
import { Country, Category, TimePeriod } from '../types';
import { bookApi, categoryApi, timePeriodApi, countryApi } from '../api';
import { X, Upload, FileText, Tag, Calendar, MapPin, Plus, Loader, Grid, FolderOpen } from 'lucide-react';

interface BookUploadModalProps {
  countryId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const BookUploadModal: React.FC<BookUploadModalProps> = ({ countryId, onClose, onSuccess }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('single');
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    description: '',
    country_id: countryId || '',
    category_id: '',
    time_period_id: '',
    author_era: '',
    theme_year_start: '',
    theme_year_end: '',
    theme_year_status: '暂未确定',
    year_start: '',
    year_end: '',
    tags: '',
    content_region_id: '',
    author_region_id: '',
    content_era_start: '',
    content_era_end: '',
    author_birth_year: '',
    author_death_year: '',
    content_era_description: '',
    author_era_description: '',
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [timePeriods, setTimePeriods] = useState<TimePeriod[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMetadata();
  }, [countryId]);

  useEffect(() => {
    if (countryId) {
      setFormData(prev => ({ ...prev, country_id: countryId }));
      loadTimePeriodsForCountry(countryId);
    }
  }, [countryId]);

  useEffect(() => {
    if (formData.country_id) {
      loadTimePeriodsForCountry(formData.country_id);
    } else {
      setTimePeriods([]);
    }
  }, [formData.country_id]);

  const loadMetadata = async () => {
    try {
      const [catRes, countryRes] = await Promise.all([
        categoryApi.list(),
        countryApi.list(),
      ]);
      setCategories(catRes.data);
      setCountries(countryRes.data);
      
      if (countryId) {
        const tpRes = await timePeriodApi.list(countryId);
        setTimePeriods(tpRes.data);
      }
    } catch (error) {
      console.error('Failed to load metadata:', error);
    }
  };

  const loadTimePeriodsForCountry = async (countryId: string) => {
    try {
      const tpRes = await timePeriodApi.list(countryId);
      setTimePeriods(tpRes.data);
    } catch (error) {
      console.error('Failed to load time periods:', error);
      setTimePeriods([]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    
    if (pdfFiles.length !== selectedFiles.length) {
      alert('只支持 PDF 文件');
    }
    
    setFiles(pdfFiles);
    
    if (pdfFiles.length === 1 && uploadMode === 'single') {
      const fileName = pdfFiles[0].name.replace(/\.pdf$/i, '');
      setFormData(prev => ({ ...prev, title: fileName }));
    }
    
    if (pdfFiles.length > 1) {
      setUploadMode('batch');
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
      
      if (pdfFiles.length === 0) {
        alert('所选文件夹中没有 PDF 文件');
        return;
      }
      
      setFiles(pdfFiles);
      setUploadMode('batch');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdfFiles = droppedFiles.filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length !== droppedFiles.length) {
      alert('只支持 PDF 文件');
    }
    
    setFiles(pdfFiles);
    
    if (pdfFiles.length === 1) {
      const fileName = pdfFiles[0].name.replace(/\.pdf$/i, '');
      setFormData(prev => ({ ...prev, title: fileName }));
    }
    
    if (pdfFiles.length > 1) {
      setUploadMode('batch');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    
    try {
      const response = await categoryApi.create({ name: newCategoryName.trim() });
      const newCategory = response.data;
      setCategories(prev => [...prev, newCategory]);
      setFormData(prev => ({ ...prev, category_id: newCategory.id }));
      setShowNewCategory(false);
      setNewCategoryName('');
    } catch (error: any) {
      console.error('Failed to create category:', error);
      const errorMsg = error.response?.data?.detail || error.message || '创建分类失败';
      alert(`创建分类失败: ${errorMsg}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (files.length === 0) {
      alert('请选择要上传的文件');
      return;
    }

    if (uploadMode === 'single' && !formData.title.trim()) {
      alert('请输入书籍标题');
      return;
    }

    setIsUploading(true);

    try {
      if (uploadMode === 'single') {
        await bookApi.upload({
          file: files[0],
          title: formData.title,
          author: formData.author || undefined,
          description: formData.description || undefined,
          country_id: formData.country_id || undefined,
          category_id: formData.category_id || undefined,
          time_period_id: formData.time_period_id || undefined,
          author_era: formData.author_era || undefined,
          theme_year_start: formData.theme_year_start ? parseInt(formData.theme_year_start) : undefined,
          theme_year_end: formData.theme_year_end ? parseInt(formData.theme_year_end) : undefined,
          theme_year_status: formData.theme_year_status || undefined,
          tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
          content_region_id: formData.content_region_id || undefined,
          author_region_id: formData.author_region_id || undefined,
          content_era_start: formData.content_era_start ? parseInt(formData.content_era_start) : undefined,
          content_era_end: formData.content_era_end ? parseInt(formData.content_era_end) : undefined,
          author_birth_year: formData.author_birth_year ? parseInt(formData.author_birth_year) : undefined,
          author_death_year: formData.author_death_year ? parseInt(formData.author_death_year) : undefined,
          content_era_description: formData.content_era_description || undefined,
          author_era_description: formData.author_era_description || undefined,
        });
      } else {
        await bookApi.uploadBatch(files, formData.country_id || undefined);
      }
      
      onSuccess();
    } catch (error: any) {
      console.error('Upload failed:', error);
      const errorMsg = error.response?.data?.detail || error.message || '上传失败，请重试';
      alert(`上传失败: ${errorMsg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    if (files.length === 1) {
      setUploadMode('single');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content book-upload-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Upload size={20} />
            上传书籍
          </h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div
              className={`file-drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {files.length === 0 ? (
                <div className="drop-zone-content">
                  <FileText size={48} strokeWidth={1} />
                  <p>拖拽 PDF 文件到此处，或点击选择文件</p>
                  <span className="hint">支持单个或批量上传</span>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                    <label className="file-select-btn" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf"
                        multiple
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                      />
                      选择文件
                    </label>
                    <label className="file-select-btn" style={{ background: 'var(--success-500)', borderColor: 'var(--success-500)' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="file"
                        // @ts-expect-error webkitdirectory is not in the type definition
                        webkitdirectory=""
                        onChange={handleFolderSelect}
                        style={{ display: 'none' }}
                      />
                      <FolderOpen size={14} style={{ marginRight: 4 }} />
                      选择文件夹
                    </label>
                  </div>
                </div>
              ) : (
                <div className="selected-files">
                  <p className="files-header">已选择 {files.length} 个文件</p>
                  <div className="files-list">
                    {files.map((file, index) => (
                      <div key={index} className="file-item">
                        <FileText size={16} />
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{formatFileSize(file.size)}</span>
                        <button
                          type="button"
                          className="remove-file-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {files.length === 1 && uploadMode === 'single' && (
              <>
              <div className="form-section">
                <h3>
                  <Tag size={16} />
                  书籍信息
                </h3>
                
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label>标题 *</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      placeholder="输入书籍标题"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <MapPin size={14} />
                      所属国家/地区
                    </label>
                    <select
                      value={formData.country_id}
                      onChange={(e) => handleInputChange('country_id', e.target.value)}
                    >
                      <option value="">选择国家/地区</option>
                      {countries.map(country => (
                        <option key={country.id} value={country.id}>{country.name}</option>
                      ))}
                    </select>
                    {countryId && (
                      <div className="country-info">
                        <span className="country-selected">
                          当前选中：{countries.find(c => c.id === countryId)?.name || '未选择'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>作者</label>
                    <input
                      type="text"
                      value={formData.author}
                      onChange={(e) => handleInputChange('author', e.target.value)}
                      placeholder="输入作者姓名"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <Calendar size={14} />
                      作者所处时代
                    </label>
                    {timePeriods.length > 0 ? (
                      <div className="era-input-group">
                        <select
                          value={formData.time_period_id}
                          onChange={(e) => {
                            handleInputChange('time_period_id', e.target.value);
                            if (e.target.value) {
                              const selectedPeriod = timePeriods.find(tp => tp.id === e.target.value);
                              if (selectedPeriod) {
                                handleInputChange('author_era', selectedPeriod.name);
                              }
                            }
                          }}
                        >
                          <option value="">选择历史时期</option>
                          {timePeriods.map(tp => (
                            <option key={tp.id} value={tp.id}>
                              {tp.name} ({tp.start_year ? (tp.start_year < 0 ? `公元前${Math.abs(tp.start_year)}年` : tp.start_year + '年') : '?'} - {tp.end_year ? (tp.end_year < 0 ? `公元前${Math.abs(tp.end_year)}年` : tp.end_year + '年') : '至今'})
                            </option>
                          ))}
                        </select>
                        <span className="or-divider">或</span>
                        <input
                          type="text"
                          value={formData.author_era}
                          onChange={(e) => {
                            handleInputChange('author_era', e.target.value);
                            handleInputChange('time_period_id', '');
                          }}
                          placeholder="自定义输入时代"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={formData.author_era}
                        onChange={(e) => handleInputChange('author_era', e.target.value)}
                        placeholder="如：北宋时期、文艺复兴时期"
                      />
                    )}
                    {formData.country_id && timePeriods.length === 0 && (
                      <div className="field-hint">该国家/地区暂无预设历史时期，请手动输入</div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>分类</label>
                    <div className="select-with-add">
                      <select
                        value={formData.category_id}
                        onChange={(e) => handleInputChange('category_id', e.target.value)}
                      >
                        <option value="">选择分类</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="add-btn"
                        onClick={() => setShowNewCategory(true)}
                        title="新建分类"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="form-group full-width">
                    <label className="label-with-hint">
                      <Calendar size={14} />
                      主题起始年代
                      <span className="field-hint">（可选：书中内容涉及的历史起始年代）</span>
                    </label>
                    <div className="input-with-hint">
                      <div className="input-with-status">
                        <input
                          type="number"
                          value={formData.theme_year_start}
                          onChange={(e) => handleInputChange('theme_year_start', e.target.value)}
                          placeholder="如：-500 表示公元前500年"
                        />
                        <select
                          className="status-select"
                          value={formData.theme_year_status}
                          onChange={(e) => handleInputChange('theme_year_status', e.target.value)}
                        >
                          <option value="暂未确定">暂未确定</option>
                          <option value="已确认">已确认</option>
                          <option value="待考证">待考证</option>
                        </select>
                      </div>
                      <div className="field-hint">负数表示公元前，如 -221 表示公元前221年</div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>
                      <Calendar size={14} />
                      主题结束年代
                    </label>
                    <div className="input-with-hint">
                      <input
                        type="number"
                        value={formData.theme_year_end}
                        onChange={(e) => handleInputChange('theme_year_end', e.target.value)}
                        placeholder="如：2023"
                      />
                      <div className="field-hint">正数表示公元后</div>
                    </div>
                  </div>

                  <div className="form-group full-width">
                    <label>标签（用逗号分隔）</label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => handleInputChange('tags', e.target.value)}
                      placeholder="如：哲学, 历史, 经典"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label>描述</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="输入书籍描述或简介"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              <div className="form-section classification-section">
                <h3>
                  <Grid size={16} />
                  分类矩阵信息
                </h3>
                
                <div className="classification-grid">
                  <div className="classification-group">
                    <h4>
                      <MapPin size={14} />
                      地区分类
                    </h4>
                    
                    <div className="form-group">
                      <label className="label-with-hint">
                        书籍内容所涉及的地区
                        <span className="field-hint">（书籍主要内容、故事背景所在地区）</span>
                      </label>
                      <select
                        value={formData.content_region_id}
                        onChange={(e) => handleInputChange('content_region_id', e.target.value)}
                      >
                        <option value="">选择内容地区</option>
                        {countries.map(country => (
                          <option key={country.id} value={country.id}>{country.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="label-with-hint">
                        书籍作者的所在地区
                        <span className="field-hint">（作者创作时的主要居住地）</span>
                      </label>
                      <select
                        value={formData.author_region_id}
                        onChange={(e) => handleInputChange('author_region_id', e.target.value)}
                      >
                        <option value="">选择作者地区</option>
                        {countries.map(country => (
                          <option key={country.id} value={country.id}>{country.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="classification-group">
                    <h4>
                      <Calendar size={14} />
                      年代分类
                    </h4>
                    
                    <div className="form-group">
                      <label className="label-with-hint">
                        书籍内容所反映的年代
                        <span className="field-hint">（书籍内容对应的历史时期）</span>
                      </label>
                      <div className="year-range-input">
                        <input
                          type="number"
                          value={formData.content_era_start}
                          onChange={(e) => handleInputChange('content_era_start', e.target.value)}
                          placeholder="起始年份"
                        />
                        <span className="range-separator">至</span>
                        <input
                          type="number"
                          value={formData.content_era_end}
                          onChange={(e) => handleInputChange('content_era_end', e.target.value)}
                          placeholder="结束年份"
                        />
                      </div>
                      <input
                        type="text"
                        value={formData.content_era_description}
                        onChange={(e) => handleInputChange('content_era_description', e.target.value)}
                        placeholder="年代描述（如：三国时期、文艺复兴时期）"
                        style={{ marginTop: '8px' }}
                      />
                    </div>

                    <div className="form-group">
                      <label className="label-with-hint">
                        书籍作者的生活年代
                        <span className="field-hint">（作者的生卒年份）</span>
                      </label>
                      <div className="year-range-input">
                        <input
                          type="number"
                          value={formData.author_birth_year}
                          onChange={(e) => handleInputChange('author_birth_year', e.target.value)}
                          placeholder="出生年份"
                        />
                        <span className="range-separator">至</span>
                        <input
                          type="number"
                          value={formData.author_death_year}
                          onChange={(e) => handleInputChange('author_death_year', e.target.value)}
                          placeholder="逝世年份"
                        />
                      </div>
                      <input
                        type="text"
                        value={formData.author_era_description}
                        onChange={(e) => handleInputChange('author_era_description', e.target.value)}
                        placeholder="年代描述（如：清代、维多利亚时代）"
                        style={{ marginTop: '8px' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              </>
            )}

            {files.length > 1 && (
              <div className="batch-info">
                <p>批量上传模式：将使用文件名作为书籍标题</p>
                <p>上传后可在书籍详情页编辑其他信息</p>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={files.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader size={16} className="spinning" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  上传
                </>
              )}
            </button>
          </div>
        </form>

        {showNewCategory && (
          <div className="modal-overlay sub-modal" onClick={() => setShowNewCategory(false)}>
            <div className="modal-content small" onClick={e => e.stopPropagation()}>
              <h3>新建分类</h3>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="输入分类名称"
                autoFocus
              />
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowNewCategory(false)}>
                  取消
                </button>
                <button className="btn btn-primary" onClick={handleCreateCategory}>
                  创建
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookUploadModal;
