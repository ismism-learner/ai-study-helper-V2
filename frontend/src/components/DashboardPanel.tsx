import React, { useState, useEffect } from 'react';
import { dashboardApi, bookApi, taskApi, Task, activityApi, Activity } from '../api';
import { BarChart3, BookOpen, Plus, ChevronRight, CheckSquare, Square, X, Calendar, Trash2, Upload, FileText, Tag, Archive, ClipboardList, CheckCircle, Library } from 'lucide-react';
import { BookDocument } from '../types';
import LoadingBook from './LoadingBook';
import '../styles/dashboard.css';

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

  const ENTITY_COLORS = ['#818cf8', '#34d399', '#f472b6', '#fbbf24', '#38bdf8'];

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
        bookApi.getRecentlyRead(10),
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
      case 'upload': return <Upload size={14} className="icon-accent" />;
      case 'note': return <FileText size={14} className="icon-success" />;
      case 'tag': return <Tag size={14} className="icon-accent" />;
      case 'archive': return <Archive size={14} className="icon-warning" />;
      default: return <FileText size={14} className="icon-muted" />;
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

  const getRecentActivity = () => {
    const today = new Date();
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    const days: { day: string; active: boolean }[] = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const active = recentlyRead.some(book => {
        if (!book.last_read_time) return false;
        return new Date(book.last_read_time).toISOString().split('T')[0] === dateStr;
      });
      
      days.push({
        day: dayNames[date.getDay()],
        active,
      });
    }
    
    return days;
  };

  const getHeatmapColor = (count: number, maxCount: number) => {
    if (count === 0 || maxCount === 0) return 'transparent';
    const intensity = Math.min(count / Math.max(maxCount, 1), 1);
    const alpha = Math.max(0.12, intensity);
    return `color-mix(in srgb, var(--primary-500) ${Math.round(alpha * 100)}%, transparent)`;
  };

  const getHeatmapBorder = (count: number, maxCount: number) => {
    if (count === 0 || maxCount === 0) return '1px solid var(--border-default)';
    const intensity = Math.min(count / Math.max(maxCount, 1), 1);
    const alpha = Math.max(0.12, intensity);
    const mixColor = `color-mix(in srgb, var(--primary-500) ${Math.round(alpha * 100)}%, transparent)`;
    return `1px solid ${mixColor}`;
  };

  const renderHeatmap = () => {
    if (heatmapData.length === 0) return null;

    const maxCount = Math.max(...heatmapData.map(d => d.count), 1);
    const todayStr = new Date().toISOString().split('T')[0];
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
    
    const monthLabels: (string | null)[] = [];
    let lastMonth = -1;
    
    weeks.forEach((week) => {
      const firstValidDay = week.find(d => d.date);
      if (firstValidDay) {
        const month = new Date(firstValidDay.date).getMonth();
        if (month !== lastMonth) {
          monthLabels.push(months[month]);
          lastMonth = month;
        } else {
          monthLabels.push(null);
        }
      } else {
        monthLabels.push(null);
      }
    });

    return (
      <div className="heatmap-layout">
        <div className="heatmap-scroll">
          <div className="heatmap-months">
            {monthLabels.map((label, i) => (
              <span
                key={i}
                className="heatmap-month-label"
              >
                {label || ''}
              </span>
            ))}
          </div>
          <div className="heatmap-grid">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="heatmap-week">
                {week.map((day, dayIndex) => {
                    const isToday = day.date === todayStr;
                    return (
                      <div
                        key={dayIndex}
                        title={day.date ? `${day.date}: ${day.count} 条笔记` : ''}
                        className={`heatmap-day${isToday ? ' heatmap-day-today' : ''}`}
                        style={{
                          backgroundColor: day.date ? getHeatmapColor(day.count, maxCount) : 'transparent',
                          border: day.date ? getHeatmapBorder(day.count, maxCount) : '1px solid var(--border-default)',
                        }}
                      />
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="dashboard-panel loading-panel">
        <LoadingBook size={32} />
      </div>
    );
  }

  const archivePercent = archiveStatus 
    ? Math.round((archiveStatus.archived / (archiveStatus.archived + archiveStatus.unarchived)) * 100) 
    : 0;

  return (
    <div className="dashboard-panel">
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <div className="dashboard-top-row">
            <div className="dash-card overview-card">
              <div className="dash-card-title">
                <BarChart3 size={15} />
                数据概览
              </div>
              
              <div className="ov-grid">
                <div className="ov-cell">
                  <div className="ov-number">{readingStats ? readingStats.total_reading_hours.toFixed(1) : '0'}</div>
                  <div className="ov-number-unit">h</div>
                  <div className="ov-label">累计阅读</div>
                </div>
                <div className="ov-cell">
                  <div className="ov-number">{readingStats?.books_with_progress || 0}</div>
                  <div className="ov-number-unit">本</div>
                  <div className="ov-label">阅读中</div>
                </div>
                <div className="ov-cell">
                  <div className="ov-number">{readingStats?.average_reading_speed || 0}</div>
                  <div className="ov-number-unit">p/h</div>
                  <div className="ov-label">阅读速度</div>
                </div>
                <div className="ov-cell">
                  <div className="ov-number">{archivePercent}</div>
                  <div className="ov-number-unit">%</div>
                  <div className="ov-label">归档率</div>
                </div>
              </div>

              {recentlyRead.length > 0 && (
                <div className="ov-week">
                  <div className="ov-week-title">近7天活跃度</div>
                  <div className="ov-week-row">
                    {getRecentActivity().map((d, i) => (
                      <div key={i} className={`ov-week-day${d.active ? ' active' : ''}`}>
                        <div className="ov-week-dot" />
                        <span className="ov-week-name">{d.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="dash-card progress-card">
              <div className="dash-card-title">
                <Library size={15} />
                归档进度
              </div>
              <div className="pr-ring-wrap">
                <div className="dash-progress-ring">
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="65" className="dash-progress-ring-bg" />
                    <circle 
                      cx="80" cy="80" r="65" className="dash-progress-ring-fill"
                      strokeDasharray={`${2 * Math.PI * 65 * archivePercent / 100} ${2 * Math.PI * 65}`}
                    />
                  </svg>
                  <div className="dash-progress-text">
                    <div className="dash-progress-number">{archivePercent}%</div>
                    <div className="dash-progress-label">已归档</div>
                  </div>
                </div>
              </div>
              <div className="dash-progress-legend">
                <span className="dash-progress-legend-item">
                  <span className="dash-progress-legend-dot dash-progress-legend-dot-success" />
                  已归档 <strong style={{ color: 'var(--success-500)' }}>{archiveStatus?.archived || 0}</strong>
                </span>
                <span className="dash-progress-legend-item">
                  <span className="dash-progress-legend-dot dash-progress-legend-dot-warning" />
                  未归档 <strong style={{ color: 'var(--warning-500)' }}>{archiveStatus?.unarchived || 0}</strong>
                </span>
              </div>
            </div>

            <div className="dash-card reading-card">
              <div className="dash-card-title">
                <BookOpen size={15} />
                继续阅读
              </div>
              {recentlyRead.length === 0 ? (
                <div className="dash-empty-state">
                  <BookOpen size={40} className="dash-empty-icon" />
                  <span className="dash-empty-text">暂无阅读记录</span>
                  <span className="dash-empty-hint">打开一本书开始阅读吧</span>
                </div>
              ) : (
                <div className="shelf-scroll" onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}>
                  <div className="shelf-track">
                    {[...recentlyRead]
                      .sort((a, b) => {
                        const ta = a.last_read_time || a.updated_at;
                        const tb = b.last_read_time || b.updated_at;
                        return tb.localeCompare(ta);
                      })
                      .slice(0, 10)
                      .map((book) => (
                      <div
                        key={book.id}
                        onClick={() => onBookSelect?.(book)}
                        className="shelf-book"
                        title={`${book.title} - ${book.last_read_page || 1}/${book.page_count || '?'}`}
                      >
                        <div className="shelf-cover"
                          style={{ background: book.thumbnail ? 'transparent' : 'var(--accent-500)' }}>
                          {book.thumbnail ? (
                            <img src={book.thumbnail} alt="" className="shelf-cover-img" />
                          ) : (
                            <BookOpen size={22} className="dash-book-cover-icon" />
                          )}
                        </div>
                        <div className="shelf-info">
                          <div className="shelf-title">{book.title}</div>
                          <div className="shelf-author">{book.author || '未知作者'}</div>
                          <div className="shelf-progress-bar">
                            <div className="shelf-progress-fill" style={{ width: `${Math.min(((book.last_read_page || 1) / (book.page_count || 1)) * 100, 100)}%` }} />
                          </div>
                          <div className="shelf-progress-text">
                            {book.last_read_page || 1}/{book.page_count || '?'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="dash-card category-card">
              <div className="dash-card-title">
                <Tag size={15} />
                藏书分类
              </div>
              {unarchivedTags.length === 0 ? (
                <div className="dash-empty-state" style={{ padding: '24px 0' }}>
                  <CheckCircle size={24} className="dash-empty-icon" />
                  <span className="dash-empty-text" style={{ fontSize: '12px' }}>所有标签均已归档</span>
                </div>
              ) : (
                <div className="cat-list">
                  {unarchivedTags.map((item, i) => (
                    <div key={i} className="cat-item">
                      <span className="cat-dot" style={{ background: ENTITY_COLORS[i % 5] }} />
                      <span className="cat-name">{item.name}</span>
                      <span className="cat-count">{item.count}本</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="dash-card heatmap-card">
            <div className="dash-heatmap-header">
              <div className="dash-card-title dash-card-title-nomargin">
                笔记活动热力图
              </div>
              <div className="dash-heatmap-toggle">
                <button className={`dash-toggle-btn ${heatmapView === 'day' ? 'active' : ''}`} onClick={() => setHeatmapView('day')}>日视图</button>
                <button className={`dash-toggle-btn ${heatmapView === 'week' ? 'active' : ''}`} onClick={() => setHeatmapView('week')}>周视图</button>
              </div>
            </div>
            <div className="dash-heatmap-container">
              {renderHeatmap()}
            </div>
          </div>

          </div>

        <div className="dashboard-sidebar">
          <div className="dash-card">
            <div className="dash-card-title dash-card-title-between">
              <span className="dash-card-title-inner"><ClipboardList size={14} /> 近期任务与待办</span>
              <button 
                onClick={() => setShowAddTask(!showAddTask)}
                className="dash-add-task-btn"
              >
                <Plus size={12} /> 添加
              </button>
            </div>
            
            {showAddTask && (
              <div className="dash-add-task-form">
                <input
                  type="text"
                  placeholder="任务内容..."
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="dash-add-task-input"
                />
                <div className="dash-add-task-row">
                  <Calendar size={14} className="icon-muted" />
                  <input
                    type="date"
                    value={newTaskDate}
                    onChange={(e) => setNewTaskDate(e.target.value)}
                    className="dash-add-task-date"
                  />
                  <button
                    onClick={handleAddTask}
                    disabled={!newTaskTitle.trim() || !newTaskDate}
                    className={`dash-add-task-submit ${newTaskTitle.trim() && newTaskDate ? 'enabled' : 'disabled'}`}
                  >
                    确定
                  </button>
                  <button
                    onClick={() => { setShowAddTask(false); setNewTaskTitle(''); setNewTaskDate(''); }}
                    className="dash-add-task-cancel"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}
            
            <div className="dash-task-scroll">
              {tasks.length === 0 ? (
                <div className="dash-empty-text-centered">
                  暂无待办任务，点击上方"添加"创建新任务
                </div>
              ) : (
                tasks.map((task) => {
                  const dueInfo = formatDueDate(task.due_date);
                  return (
                    <div key={task.id} className="dash-task-item">
                      <div className="dash-task-checkbox"
                        onClick={() => handleToggleTask(task.id, task.completed)}
                      >
                        {task.completed === 1 ? (
                          <CheckSquare size={14} className="dash-task-checkbox-completed" />
                        ) : (
                          <Square size={14} className={dueInfo.urgent ? 'dash-task-checkbox-urgent' : 'dash-task-checkbox-pending'} />
                        )}
                      </div>
                      <span onClick={() => handleToggleTask(task.id, task.completed)}
                        className={`dash-task-title ${task.completed === 1 ? 'dash-task-title-completed' : ''}`}
                      >
                        {task.title}
                      </span>
                      <span className="dash-task-due" style={{ color: dueInfo.color }}>
                        {dueInfo.text}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                        className="dash-task-delete-btn"
                        title="删除任务"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="dash-task-footer">
              <span className="dash-task-footer-text">
                {tasks.filter(t => t.completed === 0).length} 项待完成
                {tasks.filter(t => getDaysRemaining(t.due_date) < 0 && t.completed === 0).length > 0 && (
                  <span className="dash-task-overdue">
                    {tasks.filter(t => getDaysRemaining(t.due_date) < 0 && t.completed === 0).length} 项已过期
                  </span>
                )}
              </span>
              <ChevronRight size={14} className="icon-muted" />
            </div>
          </div>

          <div className="dash-card">
            <div className="dash-card-title">系统动态</div>
            <div>
              {activities.length === 0 ? (
                <div className="dash-empty-text-centered">
                   暂无活动记录
                </div>
              ) : (
                activities.map((activity) => (
                  <div key={activity.id} className="dash-activity-item">
                    {getActivityIcon(activity.action_type)}
                    <div>
                      <div>{activity.description}</div>
                      <div className="dash-activity-time">{formatActivityTime(activity.created_at)}</div>
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

export default DashboardPanel;