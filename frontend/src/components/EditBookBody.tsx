import React, { useState, useEffect, useRef } from 'react';
import { BookDocument, Country, TimePeriod } from '../types';
import { Tag, Plus, X, Search } from 'lucide-react';

interface EditBookBodyProps {
  book: BookDocument;
  countries: Country[];
  timePeriods: TimePeriod[];
  tagHistory?: string[];
  allTags?: string[];
  onDataChange?: (data: EditBookFormData) => void;
  onCreateTimePeriod?: (data: { name: string; start_year?: number; end_year?: number; country_id?: string }) => Promise<TimePeriod>;
}

export interface EditBookFormData {
  title: string;
  author: string;
  file_name: string;
  country_id: string;
  author_country_id: string;
  author_time_period_id: string;
  theme_time_period_id: string;
  theme_year_start: string;
  theme_year_end: string;
  content_era_start: string;
  content_era_end: string;
  tags: string[];
}

const EditBookBody: React.FC<EditBookBodyProps> = ({
  book,
  countries,
  timePeriods,
  tagHistory = [],
  allTags = [],
  onDataChange,
  onCreateTimePeriod
}) => {
  const [formData, setFormData] = useState<EditBookFormData>({
    title: book.title || '',
    author: book.author || '',
    file_name: book.file_path ? book.file_path.split('/').pop() || '' : '',
    country_id: book.country_id || '',
    author_country_id: book.author_country_id || '',
    author_time_period_id: book.author_time_period_id || '',
    theme_time_period_id: book.time_period_id || '',
    theme_year_start: book.theme_year_start?.toString() || '',
    theme_year_end: book.theme_year_end?.toString() || '',
    content_era_start: book.content_era_start?.toString() || '',
    content_era_end: book.content_era_end?.toString() || '',
    tags: book.tags || [],
  });

  const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);
  const [newPeriodType, setNewPeriodType] = useState<'author' | 'theme' | 'content'>('theme');
  const [newPeriodForm, setNewPeriodForm] = useState({
    name: '',
    start_year: '',
    end_year: ''
  });

  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onDataChange?.(formData);
  }, [formData, onDataChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFilteredTimePeriods = (countryId?: string) => {
    if (!countryId) return [];
    return timePeriods.filter(period => period.country_id === countryId);
  };

  const sortedCountries = countries.sort((a, b) => {
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  const getYearLabel = (year: number | null): string => {
    if (year === null || year === undefined) return '';
    if (year === 0) return '公元元年';
    if (year < 0) return `公元前${Math.abs(year)}年`;
    return `${year}年`;
  };

  const handleThemePeriodChange = (periodId: string) => {
    const selectedPeriod = timePeriods.find(p => p.id === periodId);
    setFormData({
      ...formData,
      theme_time_period_id: periodId,
      theme_year_start: selectedPeriod?.start_year?.toString() || '',
      theme_year_end: selectedPeriod?.end_year?.toString() || ''
    });
  };

  const handleAuthorPeriodChange = (periodId: string) => {
    setFormData({
      ...formData,
      author_time_period_id: periodId
    });
  };

  const handleThemeCountryChange = (countryId: string) => {
    setFormData({
      ...formData,
      country_id: countryId,
      theme_time_period_id: '',
      theme_year_start: '',
      theme_year_end: ''
    });
  };

  const handleAuthorCountryChange = (countryId: string) => {
    setFormData({
      ...formData,
      author_country_id: countryId,
      author_time_period_id: ''
    });
  };

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      setFormData({ ...formData, tags: [...formData.tags, trimmedTag] });
    }
    setTagInputValue('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(tag => tag !== tagToRemove) });
  };

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag(tagInputValue);
      setShowTagDropdown(false);
    }
  };

  const openNewPeriodModal = (type: 'author' | 'theme' | 'content') => {
    setNewPeriodType(type);
    setNewPeriodForm({ name: '', start_year: '', end_year: '' });
    setShowNewPeriodModal(true);
  };

  const handleCreateTimePeriod = async () => {
    if (!newPeriodForm.name || !onCreateTimePeriod) return;
    
    const targetCountryId = newPeriodType === 'author' ? formData.author_country_id : formData.country_id;
    
    try {
      const newPeriod = await onCreateTimePeriod({
        name: newPeriodForm.name,
        start_year: newPeriodForm.start_year ? parseInt(newPeriodForm.start_year) : undefined,
        end_year: newPeriodForm.end_year ? parseInt(newPeriodForm.end_year) : undefined,
        country_id: targetCountryId || undefined
      });

      if (newPeriodType === 'author') {
        setFormData({ ...formData, author_time_period_id: newPeriod.id });
      } else {
        setFormData({
          ...formData,
          theme_time_period_id: newPeriod.id,
          theme_year_start: newPeriod.start_year?.toString() || '',
          theme_year_end: newPeriod.end_year?.toString() || ''
        });
      }
      
      setShowNewPeriodModal(false);
    } catch (error) {
      console.error('Failed to create time period:', error);
      alert('创建历史时期失败');
    }
  };

  const filteredTagHistory = tagHistory.filter(tag => 
    !formData.tags.includes(tag) && 
    (tagInputValue ? tag.toLowerCase().includes(tagInputValue.toLowerCase()) : true)
  );

  const filteredAllTags = allTags.filter(tag =>
    !formData.tags.includes(tag) &&
    tag.toLowerCase().includes(tagInputValue.toLowerCase())
  );

  return (
    <div className="edit-book-body">
      <div className="form-group">
        <label>书籍标题</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label>作者</label>
        <input
          type="text"
          placeholder="输入作者名称"
          value={formData.author}
          onChange={(e) => setFormData({ ...formData, author: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label>文件名</label>
        <input
          type="text"
          placeholder="PDF文件名（含.pdf后缀）"
          value={formData.file_name}
          onChange={(e) => setFormData({ ...formData, file_name: e.target.value })}
        />
        <small className="form-hint">修改后将重命名实际文件</small>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>作者所在国家</label>
          <select
            value={formData.author_country_id}
            onChange={(e) => handleAuthorCountryChange(e.target.value)}
          >
            <option value="">未选择</option>
            {sortedCountries.map(country => (
              <option key={country.id} value={country.id}>{country.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>主题国家</label>
          <select
            value={formData.country_id}
            onChange={(e) => handleThemeCountryChange(e.target.value)}
          >
            <option value="">未选择</option>
            {sortedCountries.map(country => (
              <option key={country.id} value={country.id}>{country.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>作者所在的历史时期</label>
        <div className="select-with-button">
          <select
            value={formData.author_time_period_id}
            onChange={(e) => handleAuthorPeriodChange(e.target.value)}
            disabled={!formData.author_country_id}
          >
            <option value="">未选择</option>
            {getFilteredTimePeriods(formData.author_country_id).map(period => (
              <option key={period.id} value={period.id}>
                {period.name}{period.start_year !== null ? ` (${getYearLabel(period.start_year)} - ${period.end_year !== null ? getYearLabel(period.end_year) : '至今'})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-icon"
            title="创建新历史时期"
            onClick={() => openNewPeriodModal('author')}
            disabled={!formData.author_country_id}
          >
            <Plus size={16} />
          </button>
        </div>
        {!formData.author_country_id && <small className="field-hint">请先选择作者所在国家</small>}
      </div>

      <div className="form-group">
        <label>书籍主题的历史时期</label>
        <div className="select-with-button">
          <select
            value={formData.theme_time_period_id}
            onChange={(e) => handleThemePeriodChange(e.target.value)}
            disabled={!formData.country_id}
          >
            <option value="">未选择</option>
            {getFilteredTimePeriods(formData.country_id).map(period => (
              <option key={period.id} value={period.id}>
                {period.name}{period.start_year !== null ? ` (${getYearLabel(period.start_year)} - ${period.end_year !== null ? getYearLabel(period.end_year) : '至今'})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-icon"
            title="创建新历史时期"
            onClick={() => openNewPeriodModal('theme')}
            disabled={!formData.country_id}
          >
            <Plus size={16} />
          </button>
        </div>
        {!formData.country_id && <small className="field-hint">请先选择主题国家</small>}
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>主题起始年代 <span className="required-mark">*</span></label>
          <input
            type="number"
            placeholder="如：-500（归档必填）"
            value={formData.theme_year_start}
            onChange={(e) => setFormData({ ...formData, theme_year_start: e.target.value })}
          />
          <small className="form-hint">填写后将自动归档</small>
        </div>
        <div className="form-group">
          <label>主题结束年代</label>
          <input
            type="number"
            placeholder="如：2024（可选）"
            value={formData.theme_year_end}
            onChange={(e) => setFormData({ ...formData, theme_year_end: e.target.value })}
          />
          <small className="form-hint">可选，不填则仅使用起始年代</small>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>内容起始年代</label>
          <input
            type="number"
            placeholder="如：-500"
            value={formData.content_era_start}
            onChange={(e) => setFormData({ ...formData, content_era_start: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>内容结束年代</label>
          <input
            type="number"
            placeholder="如：2024"
            value={formData.content_era_end}
            onChange={(e) => setFormData({ ...formData, content_era_end: e.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>标签</label>
        <div className="tags-container">
          {formData.tags.map((tag, index) => (
            <div key={index} className="tag-item">
              <Tag size={12} />
              <span>{tag}</span>
              <button type="button" className="tag-remove" onClick={() => handleRemoveTag(tag)}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="tag-input-wrapper" ref={tagDropdownRef}>
          <div className="tag-input-container">
            <input
              type="text"
              placeholder="输入新标签..."
              value={tagInputValue}
              onChange={(e) => {
                setTagInputValue(e.target.value);
                setShowTagDropdown(true);
              }}
              onKeyPress={handleTagKeyPress}
              onFocus={() => {
                setShowTagDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (tagInputValue.trim()) {
                  handleAddTag(tagInputValue);
                }
              }}
            >
              添加
            </button>
          </div>
          
          {showTagDropdown && (
            <div className="tag-dropdown-menu">
              {tagInputValue.trim() && !formData.tags.includes(tagInputValue.trim()) && (
                <div className="dropdown-content">
                  <button
                    type="button"
                    className="tag-dropdown-item add-new"
                    onClick={() => handleAddTag(tagInputValue)}
                  >
                    <Plus size={14} />
                    添加新标签 "{tagInputValue}"
                  </button>
                </div>
              )}
              
              {filteredTagHistory.length > 0 && (
                <>
                  <div className="tag-dropdown-header">
                    {tagInputValue ? '历史标签' : '历史标签'}
                  </div>
                  <div className="dropdown-content">
                    {filteredTagHistory.slice(0, 10).map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className="tag-dropdown-item"
                        onClick={() => handleAddTag(tag)}
                      >
                        <Tag size={12} />
                        {tag}
                      </button>
                    ))}
                  </div>
                </>
              )}
              
              {tagInputValue && filteredAllTags.length > 0 && (
                <>
                  <div className="tag-dropdown-header">
                    <Search size={12} />
                    匹配标签
                  </div>
                  <div className="dropdown-content">
                    {filteredAllTags.slice(0, 5).map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className="tag-dropdown-item"
                        onClick={() => handleAddTag(tag)}
                      >
                        <Tag size={12} />
                        {tag}
                      </button>
                    ))}
                  </div>
                </>
              )}
              
              {filteredTagHistory.length === 0 && filteredAllTags.length === 0 && (
                <div className="tag-dropdown-empty">
                  {tagInputValue ? '无匹配标签' : '暂无历史标签'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showNewPeriodModal && (
        <div className="modal-overlay" onClick={() => setShowNewPeriodModal(false)}>
          <div className="new-period-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建新历史时期</h3>
              <button className="close-btn" onClick={() => setShowNewPeriodModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>时期名称 *</label>
                <input
                  type="text"
                  value={newPeriodForm.name}
                  onChange={(e) => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })}
                  placeholder="如：现代、当代、明清时期"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>起始年份</label>
                  <input
                    type="number"
                    value={newPeriodForm.start_year}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, start_year: e.target.value })}
                    placeholder="如：1840"
                  />
                </div>
                <div className="form-group">
                  <label>结束年份</label>
                  <input
                    type="number"
                    value={newPeriodForm.end_year}
                    onChange={(e) => setNewPeriodForm({ ...newPeriodForm, end_year: e.target.value })}
                    placeholder="如：1949"
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewPeriodModal(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreateTimePeriod}
                disabled={!newPeriodForm.name}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditBookBody;
