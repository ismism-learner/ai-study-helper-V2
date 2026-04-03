import React, { useState, useEffect, useMemo } from 'react';
import { BookDocument, Country } from '../types';
import { bookApi, countryApi } from '../api';
import { Grid, Book, MapPin, Calendar, Download, Info, AlertCircle, Save } from 'lucide-react';

interface ClassificationMatrixProps {
  onBookClick?: (book: BookDocument) => void;
}

interface MatrixCell {
  count: number;
  books: BookDocument[];
}

interface UnclassifiedBook {
  book: BookDocument;
  missingContentRegion: boolean;
  missingAuthorRegion: boolean;
  missingContentEra: boolean;
  missingAuthorEra: boolean;
}

const REGION_HIERARCHY = {
  continents: [
    { name: '亚洲', code: 'AS' },
    { name: '欧洲', code: 'EU' },
    { name: '北美洲', code: 'NA' },
    { name: '南美洲', code: 'SA' },
    { name: '非洲', code: 'AF' },
    { name: '大洋洲', code: 'OC' },
  ],
  quickRegions: [
    { name: '中国', code: 'CN', continent: 'AS' },
    { name: '英国', code: 'GB', continent: 'EU' },
    { name: '美国', code: 'US', continent: 'NA' },
    { name: '德国', code: 'DE', continent: 'EU' },
    { name: '意大利', code: 'IT', continent: 'EU' },
    { name: '法国', code: 'FR', continent: 'EU' },
    { name: '奥地利', code: 'AT', continent: 'EU' },
    { name: '日本', code: 'JP', continent: 'AS' },
    { name: '中国台湾', code: 'TW', continent: 'AS' },
  ],
};

const ERA_HIERARCHY = {
  major: [
    { name: '古代', start: -3000, end: 500, description: '公元前3000年至公元500年' },
    { name: '中世纪', start: 500, end: 1500, description: '公元500年至1500年' },
    { name: '近代早期', start: 1500, end: 1800, description: '公元1500年至1800年' },
    { name: '近代', start: 1800, end: 1945, description: '公元1800年至1945年' },
    { name: '当代', start: 1945, end: 2100, description: '公元1945年至今' },
  ],
};

const UNKNOWN_REGION = { name: '未知', code: 'XX', continent: 'XX' };
const UNKNOWN_ERA = { name: '未知', start: -999999, end: 999999, description: '年代未知' };

const ClassificationMatrix: React.FC<ClassificationMatrixProps> = ({ onBookClick }) => {
  const [books, setBooks] = useState<BookDocument[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'matrix' | 'standards'>('matrix');
  const [matrixType, setMatrixType] = useState<'region' | 'era'>('region');
  const [selectedCell, setSelectedCell] = useState<{ row: string; col: string; books: BookDocument[] } | null>(null);
  const [showUnclassifiedModal, setShowUnclassifiedModal] = useState(false);
  const [editingBook, setEditingBook] = useState<BookDocument | null>(null);
  const [editForm, setEditForm] = useState({
    content_region_id: '',
    author_region_id: '',
    content_era_start: '',
    content_era_end: '',
    author_birth_year: '',
    author_death_year: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [booksRes, countriesRes] = await Promise.all([
        bookApi.list(),
        countryApi.list()
      ]);
      setBooks(booksRes.data);
      setCountries(countriesRes.data);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const regionMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, MatrixCell>> = {};
    
    const allRegions = [...REGION_HIERARCHY.quickRegions, UNKNOWN_REGION];
    
    allRegions.forEach(region => {
      matrix[region.name] = {};
      allRegions.forEach(r => {
        matrix[region.name][r.name] = { count: 0, books: [] };
      });
    });

    books.forEach(book => {
      const contentRegion = book.content_region?.name || book.country?.name || UNKNOWN_REGION.name;
      const authorRegion = book.author_region?.name || UNKNOWN_REGION.name;
      
      if (matrix[contentRegion] && matrix[contentRegion][authorRegion]) {
        matrix[contentRegion][authorRegion].count++;
        matrix[contentRegion][authorRegion].books.push(book);
      }
    });
    
    return matrix;
  }, [books]);

  const eraMatrix = useMemo(() => {
    const matrix: Record<string, Record<string, MatrixCell>> = {};
    
    const allEras = [...ERA_HIERARCHY.major, UNKNOWN_ERA];
    
    allEras.forEach(contentEra => {
      matrix[contentEra.name] = {};
      allEras.forEach(authorEra => {
        matrix[contentEra.name][authorEra.name] = { count: 0, books: [] };
      });
    });

    books.forEach(book => {
      const contentEraStart = book.content_era_start;
      const contentEraEnd = book.content_era_end;
      const authorBirthYear = book.author_birth_year;
      const authorDeathYear = book.author_death_year;
      
      let contentEra = UNKNOWN_ERA;
      let authorEra = UNKNOWN_ERA;
      
      if (contentEraStart !== null && contentEraEnd !== null) {
        contentEra = ERA_HIERARCHY.major.find(
          era => contentEraStart >= era.start && contentEraEnd <= era.end
        ) || UNKNOWN_ERA;
      }
      
      if (authorBirthYear !== null && authorDeathYear !== null) {
        authorEra = ERA_HIERARCHY.major.find(
          era => authorBirthYear >= era.start && authorDeathYear <= era.end
        ) || UNKNOWN_ERA;
      }
      
      if (matrix[contentEra.name] && matrix[contentEra.name][authorEra.name]) {
        matrix[contentEra.name][authorEra.name].count++;
        matrix[contentEra.name][authorEra.name].books.push(book);
      }
    });
    
    return matrix;
  }, [books]);

  const unclassifiedBooks = useMemo(() => {
    const result: UnclassifiedBook[] = [];
    
    books.forEach(book => {
      const hasContentRegion = !!(book.content_region?.name || book.country?.name);
      const hasAuthorRegion = !!book.author_region?.name;
      const hasContentEra = book.content_era_start !== null && book.content_era_end !== null;
      const hasAuthorEra = book.author_birth_year !== null && book.author_death_year !== null;
      
      const missingContentRegion = !hasContentRegion;
      const missingAuthorRegion = !hasAuthorRegion;
      const missingContentEra = !hasContentEra;
      const missingAuthorEra = !hasAuthorEra;
      
      const missingAllRegion = missingContentRegion && missingAuthorRegion;
      const missingAllEra = missingContentEra && missingAuthorEra;
      
      if (missingAllRegion || missingAllEra) {
        result.push({
          book,
          missingContentRegion,
          missingAuthorRegion,
          missingContentEra,
          missingAuthorEra
        });
      }
    });
    
    return result;
  }, [books]);

  const unclassifiedByRegion = useMemo(() => {
    return unclassifiedBooks.filter(u => u.missingContentRegion && u.missingAuthorRegion);
  }, [unclassifiedBooks]);

  const unclassifiedByEra = useMemo(() => {
    return unclassifiedBooks.filter(u => u.missingContentEra && u.missingAuthorEra);
  }, [unclassifiedBooks]);

  const handleEditBook = (book: BookDocument) => {
    setEditingBook(book);
    setEditForm({
      content_region_id: book.content_region_id || book.country_id || '',
      author_region_id: book.author_region_id || '',
      content_era_start: book.content_era_start?.toString() || '',
      content_era_end: book.content_era_end?.toString() || '',
      author_birth_year: book.author_birth_year?.toString() || '',
      author_death_year: book.author_death_year?.toString() || ''
    });
  };

  const handleSaveClassification = async () => {
    if (!editingBook) return;
    
    try {
      const updateData: any = {};
      if (editForm.content_region_id) updateData.content_region_id = editForm.content_region_id;
      if (editForm.author_region_id) updateData.author_region_id = editForm.author_region_id;
      if (editForm.content_era_start) updateData.content_era_start = parseInt(editForm.content_era_start);
      if (editForm.content_era_end) updateData.content_era_end = parseInt(editForm.content_era_end);
      if (editForm.author_birth_year) updateData.author_birth_year = parseInt(editForm.author_birth_year);
      if (editForm.author_death_year) updateData.author_death_year = parseInt(editForm.author_death_year);
      
      await bookApi.update(editingBook.id, updateData);
      setEditingBook(null);
      loadData();
    } catch (error) {
      console.error('Failed to update book classification:', error);
      alert('更新失败');
    }
  };

  const getMatrixColor = (count: number): string => {
    if (count === 0) return 'var(--bg-light)';
    if (count < 3) return 'rgba(59, 130, 246, 0.1)';
    if (count < 10) return 'rgba(59, 130, 246, 0.3)';
    if (count < 20) return 'rgba(59, 130, 246, 0.5)';
    return 'rgba(59, 130, 246, 0.7)';
  };

  const handleCellClick = (row: string, col: string, cell: MatrixCell) => {
    if (cell.count > 0) {
      setSelectedCell({ row, col, books: cell.books });
    }
  };

  const exportMatrix = () => {
    const matrix = matrixType === 'region' ? regionMatrix : eraMatrix;
    const rows = Object.keys(matrix);
    const cols = matrixType === 'region' 
      ? REGION_HIERARCHY.quickRegions.map(r => r.name)
      : ERA_HIERARCHY.major.map(e => e.name);
    
    let csv = `,${cols.join(',')}\n`;
    rows.forEach(row => {
      const rowData = cols.map(col => {
        return matrix[row][col]?.count || 0;
      });
      csv += `${row},${rowData.join(',')}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `classification_matrix_${matrixType}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="classification-matrix-loading">
        <div className="loading-spinner" />
        <p>加载分类矩阵...</p>
      </div>
    );
  }

  return (
    <div className="classification-matrix-container">
      <div className="matrix-header">
        <div className="header-left">
          <Grid size={24} />
          <h2>书籍分类矩阵</h2>
          <span className="book-total">{books.length} 本书</span>
        </div>
        <div className="header-right">
          <button
            className={`tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            <Grid size={16} />
            分类矩阵
          </button>
          <button
            className={`tab-btn ${activeTab === 'standards' ? 'active' : ''}`}
            onClick={() => setActiveTab('standards')}
          >
            <Info size={16} />
            分类标准
          </button>
        </div>
      </div>

      {activeTab === 'matrix' && (
        <>
          <div className="matrix-controls">
            <div className="control-left">
              <button
                className={`matrix-type-btn ${matrixType === 'region' ? 'active' : ''}`}
                onClick={() => setMatrixType('region')}
              >
                <MapPin size={16} />
                地区分类矩阵
              </button>
              <button
                className={`matrix-type-btn ${matrixType === 'era' ? 'active' : ''}`}
                onClick={() => setMatrixType('era')}
              >
                <Calendar size={16} />
                年代分类矩阵
              </button>
            </div>
            <div className="control-right">
              <button className="export-btn" onClick={exportMatrix}>
                <Download size={16} />
                导出CSV
              </button>
            </div>
          </div>

          <div className="matrix-description">
            {matrixType === 'region' ? (
              <p>
                <MapPin size={14} />
                横轴：书籍内容所涉及的地区 | 纵轴：书籍作者的所在地区
              </p>
            ) : (
              <p>
                <Calendar size={14} />
                横轴：书籍内容所反映的年代 | 纵轴：书籍作者的生活年代
              </p>
            )}
          </div>

          <div className="matrix-table-container">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="corner-cell">
                    {matrixType === 'region' ? '作者地区 \\ 内容地区' : '作者年代 \\ 内容年代'}
                  </th>
                  {(matrixType === 'region' 
                    ? [...REGION_HIERARCHY.quickRegions, UNKNOWN_REGION] 
                    : [...ERA_HIERARCHY.major, UNKNOWN_ERA]
                  ).map((item, idx) => (
                    <th key={idx} className={item.name === '未知' ? 'unknown-header' : ''}>{item.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(matrixType === 'region' ? regionMatrix : eraMatrix).map(([row, cols]) => (
                  <tr key={row}>
                    <td className={`row-header ${row === '未知' ? 'unknown-header' : ''}`}>{row}</td>
                    {(matrixType === 'region' 
                      ? [...REGION_HIERARCHY.quickRegions, UNKNOWN_REGION] 
                      : [...ERA_HIERARCHY.major, UNKNOWN_ERA]
                    ).map(item => {
                      const cell = cols[item.name] || { count: 0, books: [] };
                      return (
                        <td
                          key={item.name}
                          className={`matrix-cell ${row === '未知' || item.name === '未知' ? 'unknown-cell' : ''}`}
                          style={{ backgroundColor: getMatrixColor(cell.count) }}
                          onClick={() => handleCellClick(row, item.name, cell)}
                        >
                          {cell.count > 0 && (
                            <span className="cell-count">{cell.count}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="matrix-legend">
            <span className="legend-title">书籍数量：</span>
            <div className="legend-items">
              <span className="legend-item" style={{ backgroundColor: getMatrixColor(0) }}>0</span>
              <span className="legend-item" style={{ backgroundColor: getMatrixColor(1) }}>1-2</span>
              <span className="legend-item" style={{ backgroundColor: getMatrixColor(3) }}>3-9</span>
              <span className="legend-item" style={{ backgroundColor: getMatrixColor(10) }}>10-19</span>
              <span className="legend-item" style={{ backgroundColor: getMatrixColor(20) }}>20+</span>
            </div>
          </div>

          {(matrixType === 'region' ? unclassifiedByRegion : unclassifiedByEra).length > 0 && (
            <div className="unclassified-section">
              <div 
                className="unclassified-header"
                onClick={() => setShowUnclassifiedModal(true)}
              >
                <AlertCircle size={18} className="unclassified-icon" />
                <span className="unclassified-title">
                  未归档书籍 ({(matrixType === 'region' ? unclassifiedByRegion : unclassifiedByEra).length}本)
                </span>
                <span className="unclassified-hint">点击查看并分类</span>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'standards' && (
        <div className="classification-standards">
          <section className="standard-section">
            <h3>
              <MapPin size={18} />
              第一维度：地区分类
            </h3>
            
            <div className="standard-item">
              <h4>1. 书籍内容所涉及的地区</h4>
              <p className="definition">
                <strong>定义：</strong>指书籍主要内容、故事背景、事件发生或主题所关联的地理区域。
              </p>
              <p className="scope">
                <strong>范围：</strong>需明确到国家或地区级别。
              </p>
              <div className="examples">
                <strong>示例：</strong>
                <ul>
                  <li>《红楼梦》内容地区：中国</li>
                  <li>《战争与和平》内容地区：俄罗斯</li>
                  <li>《百年孤独》内容地区：哥伦比亚</li>
                </ul>
              </div>
            </div>

            <div className="standard-item">
              <h4>2. 书籍作者的所在地区</h4>
              <p className="definition">
                <strong>定义：</strong>指书籍作者创作该作品时的主要居住国家或地区。
              </p>
              <p className="scope">
                <strong>范围：</strong>以官方户籍或主要居住地为准。
              </p>
              <div className="examples">
                <strong>示例：</strong>
                <ul>
                  <li>曹雪芹作者地区：中国</li>
                  <li>托尔斯泰作者地区：俄罗斯</li>
                  <li>马尔克斯作者地区：哥伦比亚</li>
                </ul>
              </div>
            </div>

            <div className="hierarchy-structure">
              <h5>地区层级结构：</h5>
              <div className="hierarchy-tree">
                {REGION_HIERARCHY.continents.map(continent => (
                  <div key={continent.code} className="hierarchy-node">
                    <span className="continent">{continent.name}</span>
                    <div className="children">
                      {REGION_HIERARCHY.quickRegions
                        .filter(r => r.continent === continent.code)
                        .map(region => (
                          <span key={region.code} className="country">{region.name}</span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="standard-section">
            <h3>
              <Calendar size={18} />
              第二维度：年代分类
            </h3>
            
            <div className="standard-item">
              <h4>1. 书籍内容所反映的年代</h4>
              <p className="definition">
                <strong>定义：</strong>指书籍内容、故事情节、历史事件或社会背景所对应的具体历史时期。
              </p>
              <p className="scope">
                <strong>范围：</strong>需明确到世纪或年代范围。
              </p>
              <div className="examples">
                <strong>示例：</strong>
                <ul>
                  <li>《三国演义》内容年代：公元220-280年（三国时期）</li>
                  <li>《双城记》内容年代：18世纪末（法国大革命时期）</li>
                  <li>《活着》内容年代：20世纪40-70年代</li>
                </ul>
              </div>
            </div>

            <div className="standard-item">
              <h4>2. 书籍作者的生活年代</h4>
              <p className="definition">
                <strong>定义：</strong>指书籍作者的生卒年份或主要创作活跃时期。
              </p>
              <p className="scope">
                <strong>范围：</strong>以公认的历史记录为准。
              </p>
              <div className="examples">
                <strong>示例：</strong>
                <ul>
                  <li>曹雪芹：约1715-1763年</li>
                  <li>托尔斯泰：1828-1910年</li>
                  <li>马尔克斯：1927-2014年</li>
                </ul>
              </div>
            </div>

            <div className="hierarchy-structure">
              <h5>年代层级结构：</h5>
              <div className="era-timeline">
                {ERA_HIERARCHY.major.map(era => (
                  <div key={era.name} className="era-node">
                    <span className="era-name">{era.name}</span>
                    <span className="era-range">{era.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="standard-section special-rules">
            <h3>
              <Info size={18} />
              特殊情况处理规则
            </h3>
            
            <div className="rule-item">
              <h4>跨地区作品归类规则</h4>
              <ul>
                <li>内容涉及多个国家：以主要故事发生地或核心主题关联地区为准</li>
                <li>作者多国居住：以创作该作品时的主要居住地为准</li>
                <li>无法确定主要地区：标注为"多地区"或"未确定"</li>
              </ul>
            </div>

            <div className="rule-item">
              <h4>跨年代作品归类规则</h4>
              <ul>
                <li>内容跨越多个时期：标注起始和结束年份</li>
                <li>作者生卒年不详：以主要创作活跃时期为准</li>
                <li>虚构作品年代：以作品设定的历史背景为准</li>
              </ul>
            </div>
          </section>
        </div>
      )}

      {selectedCell && (
        <div className="cell-detail-modal" onClick={() => setSelectedCell(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {matrixType === 'region' ? (
                  <>
                    <MapPin size={18} />
                    内容地区：{selectedCell.col} | 作者地区：{selectedCell.row}
                  </>
                ) : (
                  <>
                    <Calendar size={18} />
                    内容年代：{selectedCell.col} | 作者年代：{selectedCell.row}
                  </>
                )}
              </h3>
              <button className="close-btn" onClick={() => setSelectedCell(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="book-count">共 {selectedCell.books.length} 本书</p>
              <div className="book-list">
                {selectedCell.books.map(book => (
                  <div
                    key={book.id}
                    className="book-item"
                    onClick={() => {
                      if (onBookClick) {
                        onBookClick(book);
                        setSelectedCell(null);
                      }
                    }}
                  >
                    <Book size={16} />
                    <div className="book-info">
                      <span className="book-title">{book.title}</span>
                      {book.author && <span className="book-author">{book.author}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showUnclassifiedModal && (
        <div className="cell-detail-modal" onClick={() => setShowUnclassifiedModal(false)}>
          <div className="modal-content unclassified-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <AlertCircle size={18} />
                未归档书籍 ({(matrixType === 'region' ? unclassifiedByRegion : unclassifiedByEra).length}本)
              </h3>
              <button className="close-btn" onClick={() => setShowUnclassifiedModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="hint-text">
                {matrixType === 'region' 
                  ? '以下书籍缺少地区分类信息，点击书籍可进行分类' 
                  : '以下书籍缺少年代分类信息，点击书籍可进行分类'}
              </p>
              <div className="book-list">
                {(matrixType === 'region' ? unclassifiedByRegion : unclassifiedByEra).map(({ book, missingContentRegion, missingAuthorRegion, missingContentEra, missingAuthorEra }) => (
                  <div
                    key={book.id}
                    className="book-item unclassified-book-item"
                    onClick={() => handleEditBook(book)}
                  >
                    <Book size={16} />
                    <div className="book-info">
                      <span className="book-title">{book.title}</span>
                      {book.author && <span className="book-author">{book.author}</span>}
                      <div className="missing-tags">
                        {matrixType === 'region' ? (
                          <>
                            {missingContentRegion && <span className="missing-tag">缺少内容地区</span>}
                            {missingAuthorRegion && <span className="missing-tag">缺少作者地区</span>}
                          </>
                        ) : (
                          <>
                            {missingContentEra && <span className="missing-tag">缺少内容年代</span>}
                            {missingAuthorEra && <span className="missing-tag">缺少作者年代</span>}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingBook && (
        <div className="cell-detail-modal" onClick={() => setEditingBook(null)}>
          <div className="modal-content edit-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Book size={18} />
                分类编辑
              </h3>
              <button className="close-btn" onClick={() => setEditingBook(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="editing-book-info">
                <span className="book-title">{editingBook.title}</span>
                {editingBook.author && <span className="book-author">{editingBook.author}</span>}
              </div>
              
              {matrixType === 'region' ? (
                <div className="edit-form">
                  <div className="form-group">
                    <label>内容地区</label>
                    <select
                      value={editForm.content_region_id}
                      onChange={(e) => setEditForm({ ...editForm, content_region_id: e.target.value })}
                    >
                      <option value="">请选择</option>
                      {countries.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>作者地区</label>
                    <select
                      value={editForm.author_region_id}
                      onChange={(e) => setEditForm({ ...editForm, author_region_id: e.target.value })}
                    >
                      <option value="">请选择</option>
                      {countries.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="edit-form">
                  <div className="form-group">
                    <label>内容年代起始</label>
                    <input
                      type="number"
                      value={editForm.content_era_start}
                      onChange={(e) => setEditForm({ ...editForm, content_era_start: e.target.value })}
                      placeholder="如: 1800"
                    />
                  </div>
                  <div className="form-group">
                    <label>内容年代结束</label>
                    <input
                      type="number"
                      value={editForm.content_era_end}
                      onChange={(e) => setEditForm({ ...editForm, content_era_end: e.target.value })}
                      placeholder="如: 1900"
                    />
                  </div>
                  <div className="form-group">
                    <label>作者出生年份</label>
                    <input
                      type="number"
                      value={editForm.author_birth_year}
                      onChange={(e) => setEditForm({ ...editForm, author_birth_year: e.target.value })}
                      placeholder="如: 1820"
                    />
                  </div>
                  <div className="form-group">
                    <label>作者逝世年份</label>
                    <input
                      type="number"
                      value={editForm.author_death_year}
                      onChange={(e) => setEditForm({ ...editForm, author_death_year: e.target.value })}
                      placeholder="如: 1890"
                    />
                  </div>
                </div>
              )}
              
              <div className="form-actions">
                <button className="btn btn-secondary" onClick={() => setEditingBook(null)}>
                  取消
                </button>
                <button className="btn btn-primary" onClick={handleSaveClassification}>
                  <Save size={14} />
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassificationMatrix;
