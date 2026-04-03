import React, { useState, useEffect, useCallback } from 'react';
import { Document, Country, TimePeriod } from '../types';
import { documentApi, countryApi, timePeriodApi } from '../api';
import {
  ArrowLeft,
  FileText,
  AlertCircle,
  Tag,
  User,
  MapPin,
  CheckCircle2,
  Edit2,
  Save,
  X,
  Search,
  Filter,
  Globe,
  Calendar,
  Clock
} from 'lucide-react';

interface UnarchivedDocumentsPanelProps {
  onBack: () => void;
  onDocumentClick?: (doc: Document) => void;
  onArchiveComplete?: () => void;
}

interface MissingInfo {
  tags: boolean;
  author: boolean;
  contentLocation: boolean;
  timeAttribute: boolean;
}

const UnarchivedDocumentsPanel: React.FC<UnarchivedDocumentsPanelProps> = ({
  onBack,
  onArchiveComplete
}) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState<{
    tags: string;
    author: string;
    description: string;
    content_country_id: string;
    content_year_start: string;
    content_year_end: string;
  }>({ tags: '', author: '', description: '', content_country_id: '', content_year_start: '', content_year_end: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'missing-tags' | 'missing-author' | 'missing-location' | 'missing-time'>('all');
  
  const [countries, setCountries] = useState<Country[]>([]);
  const [timePeriods, setTimePeriods] = useState<TimePeriod[]>([]);

  const loadCountries = useCallback(async () => {
    try {
      const response = await countryApi.list();
      setCountries(response.data);
    } catch (error) {
      console.error('Failed to load countries:', error);
    }
  }, []);

  const loadTimePeriods = useCallback(async () => {
    try {
      const response = await timePeriodApi.list();
      setTimePeriods(response.data);
    } catch (error) {
      console.error('Failed to load time periods:', error);
    }
  }, []);

  const loadUnarchivedDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await documentApi.list({ archive_status: 'unarchived_doc' });
      const unarchived = response.data.filter((doc: Document) => {
        const hasNoTags = !doc.tags || doc.tags.length === 0;
        const hasNoAuthor = !doc.author || doc.author.trim() === '';
        const hasNoContentLocation = !doc.description || doc.description.trim() === '';
        const hasNoTimeAttribute = !doc.content_year_start && !doc.content_year_end;
        return hasNoTags || hasNoAuthor || hasNoContentLocation || hasNoTimeAttribute;
      });
      setDocuments(unarchived);
    } catch (error) {
      console.error('Failed to load unarchived documents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCountries();
    loadTimePeriods();
  }, [loadCountries, loadTimePeriods]);

  useEffect(() => {
    loadUnarchivedDocuments();
  }, [loadUnarchivedDocuments]);

  const getMissingInfo = (doc: Document): MissingInfo => {
    return {
      tags: !doc.tags || doc.tags.length === 0,
      author: !doc.author || doc.author.trim() === '',
      contentLocation: !doc.description || doc.description.trim() === '',
      timeAttribute: !doc.content_year_start && !doc.content_year_end
    };
  };

  const handleEdit = (doc: Document) => {
    setEditingDoc(doc);
    setEditForm({
      tags: doc.tags?.join(', ') || '',
      author: doc.author || '',
      description: doc.description || '',
      content_country_id: doc.content_country_id || '',
      content_year_start: doc.content_year_start?.toString() || '',
      content_year_end: doc.content_year_end?.toString() || ''
    });
  };

  const handleCountryChange = (countryId: string) => {
    setEditForm({...editForm, content_country_id: countryId});
    
    if (countryId) {
      const relatedPeriods = timePeriods.filter(tp => tp.country_id === countryId);
      if (relatedPeriods.length > 0) {
        const earliestStart = Math.min(...relatedPeriods.map(tp => tp.start_year || 0).filter(y => y > 0));
        const latestEnd = Math.max(...relatedPeriods.map(tp => tp.end_year || 0).filter(y => y > 0));
        
        if (earliestStart && earliestStart !== Infinity) {
          setEditForm(prev => ({
            ...prev,
            content_country_id: countryId,
            content_year_start: prev.content_year_start || earliestStart.toString(),
            content_year_end: prev.content_year_end || latestEnd.toString()
          }));
        }
      }
    }
  };

  const handleTimePeriodSelect = (periodId: string) => {
    const period = timePeriods.find(tp => tp.id === periodId);
    if (period) {
      setEditForm(prev => ({
        ...prev,
        content_year_start: period.start_year?.toString() || prev.content_year_start,
        content_year_end: period.end_year?.toString() || prev.content_year_end
      }));
    }
  };

  const handleSave = async () => {
    if (!editingDoc) return;

    try {
      const tags = editForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      
      const updateData: any = {
        tags: tags.length > 0 ? tags : undefined,
        author: editForm.author || undefined,
        description: editForm.description || undefined,
        content_country_id: editForm.content_country_id || undefined,
        content_year_start: editForm.content_year_start ? parseInt(editForm.content_year_start) : undefined,
        content_year_end: editForm.content_year_end ? parseInt(editForm.content_year_end) : undefined,
      };
      
      const hasAllInfo = tags.length > 0 && editForm.author && editForm.description && 
        (editForm.content_year_start || editForm.content_year_end);
      
      if (hasAllInfo) {
        updateData.archive_status = 'archived_doc';
      }
      
      await documentApi.update(editingDoc.id, updateData);
      
      setEditingDoc(null);
      loadUnarchivedDocuments();
      onArchiveComplete?.();
    } catch (error) {
      console.error('Failed to update document:', error);
      alert('保存失败，请重试');
    }
  };

  const handleCancel = () => {
    setEditingDoc(null);
  };

  const filteredDocuments = documents.filter(doc => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        doc.title.toLowerCase().includes(query) ||
        (doc.author && doc.author.toLowerCase().includes(query)) ||
        (doc.description && doc.description.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    if (filterType !== 'all') {
      const missing = getMissingInfo(doc);
      switch (filterType) {
        case 'missing-tags':
          return missing.tags;
        case 'missing-author':
          return missing.author;
        case 'missing-location':
          return missing.contentLocation;
        case 'missing-time':
          return missing.timeAttribute;
      }
    }

    return true;
  });

  const getMissingInfoText = (doc: Document): string => {
    const missing = getMissingInfo(doc);
    const missingItems = [];
    if (missing.tags) missingItems.push('标签');
    if (missing.author) missingItems.push('作者');
    if (missing.contentLocation) missingItems.push('内容描述');
    if (missing.timeAttribute) missingItems.push('时间属性');
    return missingItems.join('、');
  };

  const getCountryName = (countryId?: string) => {
    if (!countryId) return null;
    const country = countries.find(c => c.id === countryId);
    return country ? country.name : null;
  };

  const getFilteredTimePeriods = (countryId?: string) => {
    if (!countryId) return timePeriods;
    return timePeriods.filter(period => period.country_id === countryId);
  };

  return (
    <div className="unarchived-documents-panel">
      <div className="panel-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          返回地图
        </button>
        <h2>
          <AlertCircle size={24} />
          未归档文档
          <span className="count-badge">{documents.length}</span>
        </h2>
        <p className="subtitle">以下文档缺少标签、作者、内容描述或时间属性信息</p>
      </div>

      <div className="panel-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="搜索文档..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-group">
          <Filter size={16} />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
            <option value="all">全部</option>
            <option value="missing-tags">缺少标签</option>
            <option value="missing-author">缺少作者</option>
            <option value="missing-location">缺少内容描述</option>
            <option value="missing-time">缺少时间属性</option>
          </select>
        </div>
      </div>

      <div className="documents-list">
        {loading ? null : filteredDocuments.length === 0 ? (
          <div className="empty-state">
            <CheckCircle2 size={48} strokeWidth={1} />
            <p>所有文档已归档</p>
            <span>没有缺少信息的文档</span>
          </div>
        ) : (
          filteredDocuments.map(doc => {
            const missing = getMissingInfo(doc);
            const isEditing = editingDoc?.id === doc.id;

            return (
              <div key={doc.id} className="document-card">
                <div className="doc-header">
                  <div className="doc-icon">
                    <FileText size={20} />
                  </div>
                  <div className="doc-title-section">
                    <h4>{doc.title}</h4>
                    <span className="missing-info">
                      缺少: {getMissingInfoText(doc)}
                    </span>
                  </div>
                  {!isEditing && (
                    <button className="edit-btn" onClick={() => handleEdit(doc)}>
                      <Edit2 size={16} />
                      补充信息
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="edit-form">
                    <div className="form-row">
                      <div className={`form-group ${missing.tags ? 'missing' : ''}`}>
                        <label>
                          <Tag size={14} />
                          标签
                        </label>
                        <input
                          type="text"
                          value={editForm.tags}
                          onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                          placeholder="用逗号分隔，如: 历史, 金融, 政治"
                        />
                      </div>

                      <div className={`form-group ${missing.author ? 'missing' : ''}`}>
                        <label>
                          <User size={14} />
                          作者
                        </label>
                        <input
                          type="text"
                          value={editForm.author}
                          onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                          placeholder="文档作者"
                        />
                      </div>
                    </div>

                    <div className={`form-group ${missing.contentLocation ? 'missing' : ''}`}>
                      <label>
                        <MapPin size={14} />
                        内容发生地 / 描述
                      </label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="描述文档内容发生地或主要内容"
                        rows={3}
                      />
                    </div>

                    <div className={`form-group ${missing.timeAttribute ? 'missing' : ''}`}>
                      <label>
                        <Globe size={14} />
                        内容发生地（国家/地区）
                      </label>
                      <select
                        value={editForm.content_country_id}
                        onChange={(e) => handleCountryChange(e.target.value)}
                      >
                        <option value="">请选择国家/地区</option>
                        {countries.map(country => (
                          <option key={country.id} value={country.id}>
                            {country.name}
                          </option>
                        ))}
                      </select>
                      {editForm.content_country_id && getFilteredTimePeriods(editForm.content_country_id).length > 0 && (
                        <small className="form-hint">
                          已根据该国家/地区的历史时期自动填充年代范围
                        </small>
                      )}
                    </div>

                    {editForm.content_country_id && getFilteredTimePeriods(editForm.content_country_id).length > 0 && (
                      <div className="form-group">
                        <label>
                          <Clock size={14} />
                          历史时期快捷选择
                        </label>
                        <select
                          onChange={(e) => handleTimePeriodSelect(e.target.value)}
                          defaultValue=""
                        >
                          <option value="">选择历史时期自动填充年代</option>
                          {getFilteredTimePeriods(editForm.content_country_id).map(period => (
                            <option key={period.id} value={period.id}>
                              {period.name} ({period.start_year || '?'} - {period.end_year || '?'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-row">
                      <div className="form-group">
                        <label>
                          <Calendar size={14} />
                          内容起始年代
                        </label>
                        <input
                          type="number"
                          value={editForm.content_year_start}
                          onChange={(e) => setEditForm({ ...editForm, content_year_start: e.target.value })}
                          placeholder="如：-500（公元前）"
                        />
                      </div>

                      <div className="form-group">
                        <label>
                          <Calendar size={14} />
                          内容结束年代
                        </label>
                        <input
                          type="number"
                          value={editForm.content_year_end}
                          onChange={(e) => setEditForm({ ...editForm, content_year_end: e.target.value })}
                          placeholder="如：2024"
                        />
                      </div>
                    </div>

                    <div className="form-actions">
                      <button className="save-btn" onClick={handleSave}>
                        <Save size={16} />
                        保存
                      </button>
                      <button className="cancel-btn" onClick={handleCancel}>
                        <X size={16} />
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="doc-info">
                    <div className="info-row">
                      <span className={`info-item ${!missing.tags ? 'filled' : 'empty'}`}>
                        <Tag size={14} />
                        {doc.tags && doc.tags.length > 0 ? doc.tags.join(', ') : '无标签'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className={`info-item ${!missing.author ? 'filled' : 'empty'}`}>
                        <User size={14} />
                        {doc.author || '无作者'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className={`info-item ${!missing.contentLocation ? 'filled' : 'empty'}`}>
                        <MapPin size={14} />
                        {doc.description ? doc.description.substring(0, 50) + (doc.description.length > 50 ? '...' : '') : '无内容描述'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className={`info-item ${!missing.timeAttribute ? 'filled' : 'empty'}`}>
                        <Calendar size={14} />
                        {doc.content_year_start || doc.content_year_end ? (
                          <>
                            {doc.content_year_start || '?'} - {doc.content_year_end || '?'}
                            {doc.content_country_id && (
                              <span style={{ marginLeft: 8, color: '#667eea' }}>
                                ({getCountryName(doc.content_country_id)})
                              </span>
                            )}
                          </>
                        ) : '无时间属性'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default UnarchivedDocumentsPanel;
