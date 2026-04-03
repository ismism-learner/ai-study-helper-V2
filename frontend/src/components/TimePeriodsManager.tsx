import React, { useState } from 'react';
import { BookTimePeriod, BookDocument } from '../types';
import { bookApi } from '../api';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';

interface TimePeriodsManagerProps {
  book: BookDocument;
  onUpdate: (book: BookDocument) => void;
}

const TimePeriodsManager: React.FC<TimePeriodsManagerProps> = ({ book, onUpdate }) => {
  const [timePeriods, setTimePeriods] = useState<BookTimePeriod[]>(book.time_periods || []);
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState({
    theme_year_start: '',
    theme_year_end: '',
    theme_year_status: '暂未确定',
    start_page: '',
    end_page: '',
    description: '',
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddTimePeriod = async () => {
    if (!newPeriod.theme_year_start && !newPeriod.theme_year_end) return;

    setIsLoading(true);
    try {
      const response = await bookApi.createTimePeriod(book.id, {
        theme_year_start: newPeriod.theme_year_start ? parseInt(newPeriod.theme_year_start) : undefined,
        theme_year_end: newPeriod.theme_year_end ? parseInt(newPeriod.theme_year_end) : undefined,
        theme_year_status: newPeriod.theme_year_status,
        start_page: newPeriod.start_page ? parseInt(newPeriod.start_page) : undefined,
        end_page: newPeriod.end_page ? parseInt(newPeriod.end_page) : undefined,
        description: newPeriod.description,
      });

      const updatedPeriods = [...timePeriods, response.data];
      setTimePeriods(updatedPeriods);
      onUpdate({ ...book, time_periods: updatedPeriods });
      setNewPeriod({
        theme_year_start: '',
        theme_year_end: '',
        theme_year_status: '暂未确定',
        start_page: '',
        end_page: '',
        description: '',
      });
      setIsAdding(false);
    } catch (error) {
      console.error('Failed to add time period:', error);
      alert('添加时间段失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateTimePeriod = async (timePeriodId: string, updates: any) => {
    setIsLoading(true);
    try {
      const response = await bookApi.updateTimePeriod(timePeriodId, updates);
      const updatedPeriods = timePeriods.map(tp =>
        tp.id === timePeriodId ? response.data : tp
      );
      setTimePeriods(updatedPeriods);
      onUpdate({ ...book, time_periods: updatedPeriods });
      setEditingPeriod(null);
    } catch (error) {
      console.error('Failed to update time period:', error);
      alert('更新时间段失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTimePeriod = async (timePeriodId: string) => {
    if (!window.confirm('确定要删除这个时间段吗？')) return;

    setIsLoading(true);
    try {
      await bookApi.deleteTimePeriod(timePeriodId);
      const updatedPeriods = timePeriods.filter(tp => tp.id !== timePeriodId);
      setTimePeriods(updatedPeriods);
      onUpdate({ ...book, time_periods: updatedPeriods });
    } catch (error) {
      console.error('Failed to delete time period:', error);
      alert('删除时间段失败');
    } finally {
      setIsLoading(false);
    }
  };

  const renderTimePeriodCard = (timePeriod: BookTimePeriod) => {
    const isEditing = editingPeriod === timePeriod.id;
    const [editForm, setEditForm] = useState({
      theme_year_start: timePeriod.theme_year_start?.toString() || '',
      theme_year_end: timePeriod.theme_year_end?.toString() || '',
      theme_year_status: timePeriod.theme_year_status,
      start_page: timePeriod.start_page?.toString() || '',
      end_page: timePeriod.end_page?.toString() || '',
      description: timePeriod.description || '',
    });

    if (isEditing) {
      return (
        <div className="time-period-card editing">
          <div className="time-period-form">
            <div className="form-row">
              <div className="form-group">
                <label>主题起始年代</label>
                <input
                  type="number"
                  value={editForm.theme_year_start}
                  onChange={(e) => setEditForm({ ...editForm, theme_year_start: e.target.value })}
                  placeholder="如：-500"
                />
              </div>
              <div className="form-group">
                <label>主题结束年代</label>
                <input
                  type="number"
                  value={editForm.theme_year_end}
                  onChange={(e) => setEditForm({ ...editForm, theme_year_end: e.target.value })}
                  placeholder="如：2023"
                />
              </div>
              <div className="form-group">
                <label>状态</label>
                <select
                  value={editForm.theme_year_status}
                  onChange={(e) => setEditForm({ ...editForm, theme_year_status: e.target.value })}
                >
                  <option value="暂未确定">暂未确定</option>
                  <option value="已确认">已确认</option>
                  <option value="待考证">待考证</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>起始页码</label>
                <input
                  type="number"
                  value={editForm.start_page}
                  onChange={(e) => setEditForm({ ...editForm, start_page: e.target.value })}
                  placeholder="如：1"
                />
              </div>
              <div className="form-group">
                <label>结束页码</label>
                <input
                  type="number"
                  value={editForm.end_page}
                  onChange={(e) => setEditForm({ ...editForm, end_page: e.target.value })}
                  placeholder="如：100"
                />
              </div>
            </div>
            <div className="form-group full-width">
              <label>描述</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="时间段描述"
                rows={2}
              />
            </div>
            <div className="form-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setEditingPeriod(null)}
                disabled={isLoading}
              >
                <X size={16} />
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleUpdateTimePeriod(timePeriod.id, {
                  theme_year_start: editForm.theme_year_start ? parseInt(editForm.theme_year_start) : undefined,
                  theme_year_end: editForm.theme_year_end ? parseInt(editForm.theme_year_end) : undefined,
                  theme_year_status: editForm.theme_year_status,
                  start_page: editForm.start_page ? parseInt(editForm.start_page) : undefined,
                  end_page: editForm.end_page ? parseInt(editForm.end_page) : undefined,
                  description: editForm.description,
                })}
                disabled={isLoading}
              >
                <Save size={16} />
                保存
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="time-period-card">
        <div className="time-period-header">
          <h4 className="period-title">
            {timePeriod.theme_year_start || timePeriod.theme_year_end ? (
              <>
                {timePeriod.theme_year_start ? timePeriod.theme_year_start : ''}
                {timePeriod.theme_year_start && timePeriod.theme_year_end && ' - '}
                {timePeriod.theme_year_end ? timePeriod.theme_year_end : ''}
              </>
            ) : (
              '未设置年代'
            )}
            <span className={`status-badge ${timePeriod.theme_year_status === '已确认' ? 'confirmed' : ''}`}>
              {timePeriod.theme_year_status}
            </span>
          </h4>
          <div className="period-actions">
            <button
              className="action-btn"
              onClick={() => setEditingPeriod(timePeriod.id)}
              title="编辑"
            >
              <Edit2 size={14} />
            </button>
            <button
              className="action-btn delete"
              onClick={() => handleDeleteTimePeriod(timePeriod.id)}
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div className="time-period-content">
          {timePeriod.start_page || timePeriod.end_page && (
            <div className="page-info">
              <span>页码：</span>
              {timePeriod.start_page ? timePeriod.start_page : ''}
              {timePeriod.start_page && timePeriod.end_page && ' - '}
              {timePeriod.end_page ? timePeriod.end_page : ''}
            </div>
          )}
          {timePeriod.description && (
            <p className="period-description">{timePeriod.description}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="time-periods-manager">
      <div className="manager-header">
        <h3>时间段管理</h3>
        <button
          className="btn btn-primary"
          onClick={() => setIsAdding(true)}
          disabled={isLoading}
        >
          <Plus size={16} />
          添加时间段
        </button>
      </div>

      {isAdding && (
        <div className="add-period-form">
          <div className="form-row">
            <div className="form-group">
              <label>主题起始年代</label>
              <input
                type="number"
                value={newPeriod.theme_year_start}
                onChange={(e) => setNewPeriod({ ...newPeriod, theme_year_start: e.target.value })}
                placeholder="如：-500"
              />
            </div>
            <div className="form-group">
              <label>主题结束年代</label>
              <input
                type="number"
                value={newPeriod.theme_year_end}
                onChange={(e) => setNewPeriod({ ...newPeriod, theme_year_end: e.target.value })}
                placeholder="如：2023"
              />
            </div>
            <div className="form-group">
              <label>状态</label>
              <select
                value={newPeriod.theme_year_status}
                onChange={(e) => setNewPeriod({ ...newPeriod, theme_year_status: e.target.value })}
              >
                <option value="暂未确定">暂未确定</option>
                <option value="已确认">已确认</option>
                <option value="待考证">待考证</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>起始页码</label>
              <input
                type="number"
                value={newPeriod.start_page}
                onChange={(e) => setNewPeriod({ ...newPeriod, start_page: e.target.value })}
                placeholder="如：1"
              />
            </div>
            <div className="form-group">
              <label>结束页码</label>
              <input
                type="number"
                value={newPeriod.end_page}
                onChange={(e) => setNewPeriod({ ...newPeriod, end_page: e.target.value })}
                placeholder="如：100"
              />
            </div>
          </div>
          <div className="form-group full-width">
            <label>描述</label>
            <textarea
              value={newPeriod.description}
              onChange={(e) => setNewPeriod({ ...newPeriod, description: e.target.value })}
              placeholder="时间段描述"
              rows={2}
            />
          </div>
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setIsAdding(false)}
              disabled={isLoading}
            >
              <X size={16} />
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAddTimePeriod}
              disabled={isLoading}
            >
              <Plus size={16} />
              添加
            </button>
          </div>
        </div>
      )}

      <div className="time-periods-list">
        {timePeriods.length === 0 ? (
          <div className="empty-state">
            <p>暂无时间段，点击上方添加按钮创建</p>
          </div>
        ) : (
          timePeriods.map(timePeriod => renderTimePeriodCard(timePeriod))
        )}
      </div>
    </div>
  );
};

export default TimePeriodsManager;
