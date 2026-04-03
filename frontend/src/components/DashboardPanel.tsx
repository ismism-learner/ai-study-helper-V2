import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardApi } from '../api';
import { BarChart3, Loader2 } from 'lucide-react';

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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

const DashboardPanel: React.FC = () => {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<{ archived: number; unarchived: number } | null>(null);
  const [countryDistribution, setCountryDistribution] = useState<Array<{ name: string; value: number }>>([]);
  const [tagsDistribution, setTagsDistribution] = useState<Array<{ name: string; value: number }>>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [overviewRes, archiveRes, countryRes, tagsRes, heatmapRes] = await Promise.all([
        dashboardApi.getOverview(),
        dashboardApi.getArchiveStatus(),
        dashboardApi.getCountryDistribution(),
        dashboardApi.getTagsDistribution(),
        dashboardApi.getActivityHeatmap(),
      ]);

      setOverview(overviewRes.data);
      setArchiveStatus(archiveRes.data);
      setCountryDistribution(countryRes.data);
      setTagsDistribution(tagsRes.data);
      setHeatmapData(heatmapRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHeatmapColor = (count: number, maxCount: number) => {
    if (count === 0) return '#ebedf0';
    const intensity = Math.min(count / Math.max(maxCount, 1), 1);
    const blueShades = ['#c6e48b', '#7bc96f', '#239a3b', '#196127'];
    const index = Math.min(Math.floor(intensity * 4), 3);
    return blueShades[index];
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

    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '24px' }}>
          {dayLabels.map((label, i) => (
            <div key={i} style={{ height: '16px', fontSize: '10px', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: '14px' }}>
              {i % 2 === 1 ? label : ''}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <div style={{ position: 'relative', height: '20px', marginBottom: '4px' }}>
            {monthLabels.map(({ weekIndex, month }) => (
              <span
                key={`month-${weekIndex}`}
                style={{
                  position: 'absolute',
                  left: `${weekIndex * 18}px`,
                  fontSize: '11px',
                  color: '#666',
                  whiteSpace: 'nowrap',
                }}
              >
                {months[month]}
              </span>
            ))}
          </div>
          <div style={{ position: 'relative', display: 'flex', gap: '2px' }}>
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {week.map((day, dayIndex) => (
                  <div
                    key={dayIndex}
                    title={day.date ? `${day.date}: ${day.count} 条笔记` : ''}
                    style={{
                      width: '16px',
                      height: '16px',
                      backgroundColor: day.date ? getHeatmapColor(day.count, maxCount) : 'transparent',
                      borderRadius: '2px',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
          <span style={{ fontSize: '10px', color: '#666' }}>少</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'].map((color, i) => (
              <div key={i} style={{ width: '16px', height: '16px', backgroundColor: color, borderRadius: '2px' }} />
            ))}
          </div>
          <span style={{ fontSize: '10px', color: '#666' }}>多</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <Loader2 size={32} className="spinning" style={{ color: 'var(--primary-color)' }} />
      </div>
    );
  }

  const archivePieData = archiveStatus ? [
    { name: '已归档', value: archiveStatus.archived },
    { name: '未归档', value: archiveStatus.unarchived },
  ] : [];

  return (
    <div className="dashboard-panel" style={{ outline: 'none' }}>
      <h2 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>
        <BarChart3 size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
        数据分析
      </h2>

      <div className="stats-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '6px', padding: '10px', color: 'white', outline: 'none', userSelect: 'none', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>{overview?.total_documents || 0}</div>
          <div style={{ fontSize: '10px', opacity: 0.9 }}>文档</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', borderRadius: '6px', padding: '10px', color: 'white', outline: 'none', userSelect: 'none', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>{overview?.total_books || 0}</div>
          <div style={{ fontSize: '10px', opacity: 0.9 }}>书籍</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', borderRadius: '6px', padding: '10px', color: 'white', outline: 'none', userSelect: 'none', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>{overview?.today_notes || 0}</div>
          <div style={{ fontSize: '10px', opacity: 0.9 }}>今日笔记</div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', borderRadius: '6px', padding: '10px', color: 'white', outline: 'none', userSelect: 'none', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: '700' }}>{overview?.archived_books || 0}</div>
          <div style={{ fontSize: '10px', opacity: 0.9 }}>已归档</div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-white)', borderRadius: '6px', padding: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', minHeight: '140px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>
          笔记活动热力图
        </h3>
        {renderHeatmap()}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 180px', gap: '10px' }}>
        <div style={{ background: 'var(--bg-white)', borderRadius: '6px', padding: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>
            国家分布 Top 10
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={countryDistribution} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" fontSize={10} tickLine={false} width={60} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--bg-white)', borderRadius: '6px', padding: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>
            标签分布
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '180px' }}>
            <div style={{ flex: '0 0 140px', height: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tagsDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={1}
                    dataKey="value"
                  >
                    {tagsDistribution.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: '6px', 
              fontSize: '10px',
              flex: 1,
              overflowY: 'auto',
              maxHeight: '170px'
            }}>
              {tagsDistribution.map((item, index) => (
                <span key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ 
                    width: '10px', 
                    height: '10px', 
                    borderRadius: '2px', 
                    backgroundColor: COLORS[index % COLORS.length],
                    flexShrink: 0
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name} ({item.value})
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-white)', borderRadius: '6px', padding: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-primary)' }}>
            归档状态
          </h3>
          <div style={{ position: 'relative', width: '100%', height: 140 }}>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie
                  data={archivePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  paddingAngle={2}
                  dataKey="value"
                >
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none'
            }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: '#f59e0b' }}>
                {archiveStatus ? Math.round((archiveStatus.unarchived / (archiveStatus.archived + archiveStatus.unarchived)) * 100) : 0}%
              </div>
              <div style={{ fontSize: '10px', color: '#666' }}>未归档</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '10px', marginTop: '4px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }} />
              已归档 {archiveStatus?.archived || 0}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f59e0b' }} />
              未归档 {archiveStatus?.unarchived || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPanel;
