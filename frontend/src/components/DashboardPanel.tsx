import React, { useState, useEffect } from 'react';
import { dashboardApi, bookApi, taskApi, Task, activityApi, Activity } from '../api';
import { BarChart3, Loader2, BookOpen, Clock, Play, Library, Plus, Bell, Settings, ChevronRight, CheckSquare, Square, X, Calendar, Trash2, Upload, FileText, Tag, Archive, ClipboardList, Share2, CheckCircle } from 'lucide-react';
import { BookDocument } from '../types';

interface OverviewData {
  total_documents: number;
  total_books: number;
  today_notes: number;
  archived_books: number;
  unarchived_books: number;
}

interface HeatmapData {
  date: string;
  count: number;
}

interface ReadingStats {
  total_reading_hours: number;
  books_with_progress: number;
  average_reading_speed: number;
}

interface DashboardPanelProps {
  onBookSelect?: (book: BookDocument) => void;
}

const DashboardPanel: React.FC<DashboardPanelProps> = ({ onBookSelect }) => {
  const [, setOverview] = useState<OverviewData | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<{ archived: number; unarchived: number } | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [recentlyRead, setRecentlyRead] = useState<BookDocument[]>([]);
  const [readingStats, setReadingStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [heatmapView, setHeatmapView] = useState<'day' | 'week'>('day');
  const [unarchivedTags, setUnarchivedTags] = useState<Array<{ name: string; count: number }>>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [activities, setActivities] = useState<Activity[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [overviewRes, archiveRes, heatmapRes, recentlyReadRes, readingStatsRes, unarchivedTagsRes] = await Promise.all([
        dashboardApi.getOverview(),
        dashboardApi.getArchiveStatus(),
        dashboardApi.getActivityHeatmap(),
        bookApi.getRecentlyRead(5),
        bookApi.getReadingStats(),
        dashboardApi.getUnarchivedTags(),
      ]);

      setOverview(overviewRes.data);
      setArchiveStatus(archiveRes.data);
      setHeatmapData(heatmapRes.data);
      setRecentlyRead(recentlyReadRes.data);
      setReadingStats(readingStatsRes.data);
      setUnarchivedTags(unarchivedTagsRes.data);
      
      const tasksRes = await taskApi.list(false);
      setTasks(tasksRes.data);
      
      const activitiesRes = await activityApi.list(5);
      setActivities(activitiesRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatActivityTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  const getActivityIcon = (actionType: string) => {
    switch (actionType) {
      case 'upload': return <Upload size={14} style={{ color: 'var(--accent-500)' }} />;
      case 'note': return <FileText size={14} style={{ color: 'var(--success-500)' }} />;
      case 'tag': return <Tag size={14} style={{ color: 'var(--accent-500)' }} />;
      case 'archive': return <Archive size={14} style={{ color: 'var(--warning-500)' }} />;
      default: return <FileText size={14} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !newTaskDate) return;
    
    try {
      const res = await taskApi.create({
        title: newTaskTitle.trim(),
        due_date: new Date(newTaskDate).toISOString(),
        task_type: 'general',
        priority: 'normal'
      });
      setTasks(prev => [...prev, res.data].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()));
      setNewTaskTitle('');
      setNewTaskDate('');
      setShowAddTask(false);
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleToggleTask = async (taskId: string, completed: number) => {
    try {
      if (completed === 0) {
        await taskApi.complete(taskId);
      } else {
        await taskApi.uncomplete(taskId);
      }
      setTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, completed: completed === 0 ? 1 : 0 } : t
      ));
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await taskApi.delete(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (error) {
      console.error('Failed to delete task:', error);
    }
  };

  const getDaysRemaining = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const formatDueDate = (dueDate: string) => {
    const days = getDaysRemaining(dueDate);
    const date = new Date(dueDate);
    
    if (days < 0) {
      return { text: `已过期 ${Math.abs(days)} 天`, color: 'var(--danger-500)', urgent: true };
    } else if (days === 0) {
      return { text: '今天截止', color: 'var(--warning-500)', urgent: true };
    } else if (days === 1) {
      return { text: '明天截止', color: 'var(--warning-500)', urgent: false };
    } else if (days <= 7) {
      return { text: `${days} 天后`, color: 'var(--primary-500)', urgent: false };
    } else {
      return { text: `${date.getMonth() + 1}/${date.getDate()}`, color: 'var(--text-muted)', urgent: false };
    }
  };

  const getHeatmapColor = (count: number, maxCount: number) => {
    if (count === 0) return 'var(--bg-surface)';
    if (maxCount === 0) return 'var(--bg-surface)';
    const intensity = Math.min(count / Math.max(maxCount, 1), 1);
    const colors = ['#0d3b66', '#0e4f7a', '#0f6390', '#1078a8', '#119cc0'];
    const index = Math.min(Math.floor(intensity * colors.length), colors.length - 1);
    return colors[index];
  };

  const renderHeatmap = () => {
    if (heatmapData.length === 0) return null;

    const maxCount = Math.max(...heatmapData.map(d => d.count), 1);
    const weeks: HeatmapData[][] = [];
    let currentWeek: HeatmapData[] = [];

    heatmapData.forEach((day, index) => {
      const date = new Date(day.date);
      const dayOfWeek = date.getDay();
      
      if (index === 0) {
        for (let i = 0; i < dayOfWeek; i++) {
          currentWeek.push({ date: '', count: 0 });
        }
      }

      currentWeek.push(day);

      if (dayOfWeek === 6 || index === heatmapData.length - 1) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    
    const monthLabels: { weekIndex: number; month: number }[] = [];
    let lastMonth = -1;
    
    weeks.forEach((week, weekIndex) => {
      const firstValidDay = week.find(d => d.date);
      if (firstValidDay) {
        const month = new Date(firstValidDay.date).getMonth();
        if (month !== lastMonth) {
          monthLabels.push({ weekIndex, month });
          lastMonth = month;
        }
      }
    });

    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <div style={{ position: 'relative', height: '16px', marginBottom: '6px' }}>
            {monthLabels.map(({ weekIndex, month }) => (
              <span
                key={`month-${weekIndex}`}
                style={{
                  position: 'absolute',
                  left: `${weekIndex * 14}px`,
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {months[month]}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '3px' }}>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {week.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    title={day.date ? `${day.date}: ${day.count} 条笔记` : ''}
                    style={{
                      width: '12px',
                      height: '12px',
                      backgroundColor: day.date ? getHeatmapColor(day.count, maxCount) : 'transparent',
                      borderRadius: '2px',
                      border: day.date && day.count > 0 ? 'none' : '1px solid var(--border-default)',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', marginLeft: '8px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>少</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
              <div key={i} style={{ width: '11px', height: '11px', backgroundColor: getHeatmapColor(Math.ceil(v * maxCount), maxCount), borderRadius: '2px' }} />
            ))}
          </div>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>多</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Loader2 size={32} className="spinning" style={{ color: 'var(--primary-color)' }} />
      </div>
    );
  }

  const archivePercent = archiveStatus 
    ? Math.round((archiveStatus.archived / (archiveStatus.archived + archiveStatus.unarchived)) * 100) 
    : 0;

  const totalNotesThisYear = heatmapData.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="dashboard-panel" style={{ outline: 'none', height: '100%', display: 'flex', flexDirection: 'column', color: 'var(--text-primary)' }}>
      <style>{`
        .dash-card {
          background: linear-gradient(145deg, #1e293b 0%, #162032 100%);
          border: 1px solid rgba(71, 85, 105, 0.4);
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        .dash-card-title {
          font-size: 13px;
          font-weight: 600;
          color: #94a3b8;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dash-book-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
          background: rgba(30, 41, 59, 0.5);
        }
        .dash-book-item:hover {
          background: rgba(51, 65, 85, 0.6);
          border-color: rgba(99, 102, 241, 0.3);
          transform: translateX(4px);
        }
        .dash-stat-number {
          font-size: 28px;
          font-weight: 700;
          line-height: 1;
        }
        .dash-stat-label {
          font-size: 11px;
          color: #64748b;
          margin-top: 4px;
        }
        .dash-toggle-btn {
          padding: 4px 10px;
          font-size: 11px;
          border-radius: 6px;
          border: 1px solid #334155;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dash-toggle-btn.active {
          background: rgba(99, 102, 241, 0.2);
          border-color: rgba(99, 102, 241, 0.5);
          color: #818cf8;
        }
        .dash-progress-ring {
          position: relative;
          width: 120px;
          height: 120px;
        }
        .dash-progress-ring svg {
          transform: rotate(-90deg);
        }
        .dash-progress-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
        }
        .dash-task-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          font-size: 12px;
          color: #94a3b8;
          cursor: pointer;
          transition: color 0.2s;
        }
        .dash-task-item:hover {
          color: #e2e8f0;
        }
        .dash-activity-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 8px 0;
          border-bottom: 1px solid rgba(51, 65, 85, 0.3);
          font-size: 11px;
        }
        .dash-activity-item:last-child {
          border-bottom: none;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spinning {
          animation: spin 1s linear infinite;
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexShrink: 0 }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={18} />
          图书馆大厅
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '6px', transition: 'background 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Plus size={18} />
          </button>
          <button style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Bell size={18} />
          </button>
          <button style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '16px' }}>
            <div className="dash-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="dash-card-title">
                <BookOpen size={15} />
                继续阅读
              </div>
              {recentlyRead.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', gap: '8px' }}>
                  <BookOpen size={40} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: '13px' }}>暂无阅读记录</span>
                  <span style={{ fontSize: '11px' }}>打开一本书开始阅读吧</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflow: 'auto' }}>
                  {recentlyRead.slice(0, 3).map((book, idx) => (
                    <div
                      key={book.id}
                      onClick={() => onBookSelect?.(book)}
                      className="dash-book-item"
                    >
                      <div style={{
                        width: idx === 0 ? '52px' : '44px',
                        height: idx === 0 ? '72px' : '60px',
                        borderRadius: '6px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        background: book.thumbnail ? 'transparent' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}>
                        {book.thumbnail ? (
                          <img src={book.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <BookOpen size={idx === 0 ? 22 : 16} style={{ color: 'white' }} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: idx === 0 ? '14px' : '12px', fontWeight: '500', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {book.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                          {book.author || '未知作者'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>第 {book.last_read_page} / {book.page_count || '?'} 页</span>
                          <Play size={14} style={{ color: 'var(--accent-500)' }} />
                        </div>
                        {idx === 0 && (
                          <div style={{
                            marginTop: '6px',
                            height: '3px',
                            background: 'rgba(129, 140, 248, 0.2)',
                            borderRadius: '2px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(((book.last_read_page || 1) / (book.page_count || 1)) * 100, 100)}%`,
                              background: 'linear-gradient(90deg, #818cf8, #a78bfa)',
                              borderRadius: '2px'
                            }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="dash-card">
              <div className="dash-card-title">
                <Clock size={15} />
                阅读统计
                <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                  <button style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>●</button>
                  <button style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontSize: '10px', cursor: 'pointer' }}>○</button>
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="dash-stat-number" style={{ color: 'var(--primary-500)' }}>{readingStats?.total_reading_hours || 0}<span style={{ fontSize: '14px' }}>.{String(readingStats?.total_reading_hours || 0).split('.')[1]?.padEnd(1,'0')||'1'}</span></div>
                  <div className="dash-stat-label">小时</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="dash-stat-number" style={{ color: 'var(--success-500)' }}>{readingStats?.books_with_progress || 0}</div>
                  <div className="dash-stat-label">阅读中</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '50px', marginBottom: '12px', padding: '0 4px' }}>
                {[0.3, 0.8, 0.45, 0.9, 0.55, 0.35, 0.7].map((v, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: '3px' }}>
                    <div style={{
                      width: '100%',
                      maxWidth: '28px',
                      height: `${v * 100}%`,
                      background: i % 3 === 0 ? '#818cf8' : 'rgba(129, 140, 248, 0.3)',
                      borderRadius: '3px 3px 0 0',
                      minHeight: '4px',
                    }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{['0.1','0.0'][i % 2]} 小时</span>
                  </div>
                ))}
              </div>

              <div style={{ textAlign: 'center', paddingTop: '10px', borderTop: '1px solid rgba(51, 65, 85, 0.4)' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>今日/本周/本月</span>
              </div>
            </div>
          </div>

          <div className="dash-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div className="dash-card-title" style={{ marginBottom: 0 }}>
                笔记活动热力图
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className={`dash-toggle-btn ${heatmapView === 'day' ? 'active' : ''}`} onClick={() => setHeatmapView('day')}>日视图</button>
                <button className={`dash-toggle-btn ${heatmapView === 'week' ? 'active' : ''}`} onClick={() => setHeatmapView('week')}>周视图</button>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'auto' }}>
              {renderHeatmap()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(51, 65, 85, 0.3)', fontSize: '11px', color: 'var(--text-muted)' }}>
              <span>少</span>
              <div style={{ display: 'flex', gap: '3px' }}>
                <span>稀疏</span>
                <span>密集</span>
                <span>频繁</span>
              </div>
              <span>多</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              过去一年共记录 <span style={{ color: 'var(--primary-500)' }}>{totalNotesThisYear}</span> 条笔记（最高{Math.max(...heatmapData.map(d=>d.count))}条/天）
            </div>
          </div>

          <div className="dash-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div className="dash-card-title" style={{ marginBottom: 0 }}>
                ❄ 知识图谱摘要
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button className="dash-toggle-btn">日视图</button>
                <button className="dash-toggle-btn">周视图</button>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '150px' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <Share2 size={40} strokeWidth={1} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <div style={{ fontSize: '13px' }}>知识图谱可视化</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>展示概念关联与主题分布</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto' }}>
          <div className="dash-card">
            <div className="dash-card-title">归档进度</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
              <div className="dash-progress-ring">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="var(--bg-surface)" strokeWidth="10" />
                  <circle 
                    cx="60" cy="60" r="50" fill="none" stroke="var(--success-500)" strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 50 * archivePercent / 100} ${2 * Math.PI * 50}`}
                    style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.4))' }}
                  />
                </svg>
                <div className="dash-progress-text">
                  <div style={{ fontSize: '32px', fontWeight: '700', color: 'var(--success-500)', lineHeight: 1 }}>{archivePercent}%</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>已归档</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', fontSize: '11px', marginBottom: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--success-500)' }} />
                已归档 <strong style={{ color: 'var(--success-500)' }}>{archiveStatus?.archived || 0}</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: 'var(--warning-500)' }} />
                未归档 <strong style={{ color: 'var(--warning-500)' }}>{archiveStatus?.unarchived || 0}</strong>
              </span>
            </div>
            
            <div style={{ borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '10px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Library size={12} /> {unarchivedTags.length} 个标签未归档
              </div>
              {unarchivedTags.length === 0 ? (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' }}>
                  所有标签下的书籍都已归档 <CheckCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
                </div>
              ) : (
                unarchivedTags.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#38bdf8'][i % 5] }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}：{item.count} 本</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-title" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><ClipboardList size={14} /> 近期任务与待办</span>
              <button 
                onClick={() => setShowAddTask(!showAddTask)}
                style={{ background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: 'var(--accent-500)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={12} /> 添加
              </button>
            </div>
            
            {showAddTask && (
              <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px', border: '1px solid rgba(51, 65, 85, 0.4)' }}>
                <input
                  type="text"
                  placeholder="任务内容..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '12px', marginBottom: '8px', outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                   <input
                     type="date"
                     value={newTaskDate}
                     onChange={(e) => setNewTaskDate(e.target.value)}
                    style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '6px 8px', color: 'var(--text-primary)', fontSize: '11px', outline: 'none' }}
                   />
                   <button
                     onClick={handleAddTask}
                     disabled={!newTaskTitle.trim() || !newTaskDate}
                    style={{ background: newTaskTitle.trim() && newTaskDate ? 'var(--accent-500)' : 'var(--border-default)', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: newTaskTitle.trim() && newTaskDate ? 'pointer' : 'not-allowed', color: 'white', fontSize: '11px' }}
                   >
                     确定
                   </button>
                   <button
                     onClick={() => { setShowAddTask(false); setNewTaskTitle(''); setNewTaskDate(''); }}
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: '6px', padding: '6px 8px', cursor: 'pointer', color: 'var(--text-muted)' }}
                   >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}
            
            <div style={{ maxHeight: '200px', overflow: 'auto' }}>
              {tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  暂无待办任务，点击上方"添加"创建新任务
                </div>
              ) : (
                tasks.map((task) => {
                  const dueInfo = formatDueDate(task.due_date);
                  return (
                    <div key={task.id} className="dash-task-item" style={{ position: 'relative', paddingRight: '28px' }}>
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}
                        onClick={() => handleToggleTask(task.id, task.completed)}
                      >
                        {task.completed === 1 ? (
                          <CheckSquare size={14} style={{ color: 'var(--success-500)', flexShrink: 0 }} />
                        ) : (
                          <Square size={14} style={{ color: dueInfo.urgent ? 'var(--danger-500)' : 'var(--text-muted)', flexShrink: 0 }} />
                        )}
                        <span style={{ textDecoration: task.completed === 1 ? 'line-through' : 'none', opacity: task.completed === 1 ? 0.5 : 1, flex: 1 }}>
                          {task.title}
                        </span>
                        <span style={{ fontSize: '10px', color: dueInfo.color, whiteSpace: 'nowrap' }}>
                          {dueInfo.text}
                        </span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                        style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', opacity: 0.5 }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(51, 65, 85, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {tasks.filter(t => t.completed === 0).length} 项待完成
                {tasks.filter(t => getDaysRemaining(t.due_date) < 0 && t.completed === 0).length > 0 && (
                  <span style={{ color: 'var(--danger-500)', marginLeft: '8px' }}>
                    {tasks.filter(t => getDaysRemaining(t.due_date) < 0 && t.completed === 0).length} 项已过期
                  </span>
                )}
              </span>
              <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-title">系统动态</div>
            <div>
              {activities.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  暂无活动记录
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="dash-activity-item">
                    {getActivityIcon(activity.action_type)}
                    <div style={{ flex: 1 }}>
                      <div>{activity.description}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '10px', marginTop: '2px' }}>
                        {formatActivityTime(activity.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(DashboardPanel);
