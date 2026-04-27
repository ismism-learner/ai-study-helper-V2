import React, { useState, useMemo, useRef, useCallback } from 'react';
import { WorldTimelineEvent } from '../types';
import { 
  ZoomIn, 
  ZoomOut, 
  Move, 
  Maximize2, 
  Info,
  Calendar,
  Clock,
  MapPin,
  Tag
} from 'lucide-react';

interface HierarchicalTimelineProps {
  events: WorldTimelineEvent[];
  onEventClick?: (event: WorldTimelineEvent) => void;
  onJumpToPage?: (pageNumber: number) => void;
  height?: number;
}

interface TimelineEvent {
  id: string;
  title: string;
  date: number; // 转换为数字格式便于计算，公元前为负数
  dateDisplay: string;
  pageNumber: number;
  description?: string;
  importance: 'low' | 'normal' | 'high';
  tags?: string[];
  duration?: { start: number; end: number }; // 时间跨度
  originalEvent: WorldTimelineEvent;
}

interface ViewState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const HierarchicalTimeline: React.FC<HierarchicalTimelineProps> = ({
  events,
  onEventClick,
  onJumpToPage,
  height = 500
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewState, setViewState] = useState<ViewState>({
    scale: 1,
    offsetX: 50,
    offsetY: 80
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    event?: TimelineEvent;
  }>({ visible: false, x: 0, y: 0 });

  // 转换事件数据
  const timelineEvents = useMemo((): TimelineEvent[] => {
    return events.map(event => {
      const dateParts = event.event_date.split('-');
      let dateNum = 0;
      
      if (dateParts.length === 1) {
        dateNum = parseInt(dateParts[0]);
      } else if (dateParts.length >= 2) {
        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) || 6;
        dateNum = year + (month - 1) / 12;
      }

      return {
        id: event.id,
        title: event.event_title,
        date: dateNum,
        dateDisplay: event.event_date_display,
        pageNumber: event.page_number,
        description: event.event_description || undefined,
        importance: event.importance as 'low' | 'normal' | 'high',
        tags: event.tags || undefined,
        originalEvent: event
      };
    }).sort((a, b) => a.date - b.date);
  }, [events]);

  // 计算时间范围
  const timeRange = useMemo(() => {
    if (timelineEvents.length === 0) return { min: -100, max: 100 };
    const dates = timelineEvents.map(e => e.date);
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    const padding = (max - min) * 0.1;
    return { min: min - padding, max: max + padding };
  }, [timelineEvents]);

  // 时间轴配置
  const timelineConfig = useMemo(() => {
    const width = 1200;
    const timeSpan = timeRange.max - timeRange.min;
    const pixelsPerUnit = (width - 100) / timeSpan;
    
    return {
      width,
      height: height - 100,
      centerY: (height - 100) / 2,
      pixelsPerUnit,
      tickInterval: calculateTickInterval(timeSpan)
    };
  }, [timeRange, height]);

  // 计算刻度间隔
  function calculateTickInterval(timeSpan: number): number {
    if (timeSpan > 5000) return 1000;
    if (timeSpan > 1000) return 100;
    if (timeSpan > 500) return 50;
    if (timeSpan > 100) return 10;
    if (timeSpan > 50) return 5;
    if (timeSpan > 10) return 1;
    return 0.5;
  }

  // 将时间转换为X坐标
  const timeToX = useCallback((time: number): number => {
    return 50 + (time - timeRange.min) * timelineConfig.pixelsPerUnit * viewState.scale + viewState.offsetX;
  }, [timeRange.min, timelineConfig.pixelsPerUnit, viewState.scale, viewState.offsetX]);

  // 生成刻度
  const ticks = useMemo(() => {
    const ticks = [];
    const startTick = Math.floor(timeRange.min / timelineConfig.tickInterval) * timelineConfig.tickInterval;
    const endTick = Math.ceil(timeRange.max / timelineConfig.tickInterval) * timelineConfig.tickInterval;
    
    for (let t = startTick; t <= endTick; t += timelineConfig.tickInterval) {
      ticks.push({
        time: t,
        x: timeToX(t),
        label: formatYearLabel(t)
      });
    }
    return ticks;
  }, [timeRange, timelineConfig.tickInterval, timeToX]);

  // 格式化年份标签
  function formatYearLabel(year: number): string {
    if (year === 0) return '公元元年';
    if (year < 0) return `公元前${Math.abs(Math.round(year))}年`;
    return `${Math.round(year)}年`;
  }

  // 计算事件的Y位置（根据重要性分层）
  const getEventY = (importance: string, index: number): number => {
    const baseY = timelineConfig.centerY;
    const offset = importance === 'high' ? -60 : importance === 'normal' ? 0 : 60;
    return baseY + offset + (index % 3) * 20;
  };

  // 生成贝塞尔曲线路径
  const generateBezierPath = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    curvature: number = 0.3
  ): string => {
    const midX = startX + (endX - startX) * 0.5;
    const controlY = startY + (endY - startY) * curvature;
    return `M ${startX} ${startY} Q ${midX} ${controlY} ${endX} ${endY}`;
  };

  // 生成时间跨度括号路径
  const generateBracketPath = (
    startX: number,
    endX: number,
    y: number,
    height: number = 30
  ): string => {
    const bracketWidth = 10;
    return `
      M ${startX} ${y}
      L ${startX} ${y - height}
      L ${startX + bracketWidth} ${y - height}
      M ${startX} ${y - height}
      L ${startX} ${y + height}
      L ${startX + bracketWidth} ${y + height}
      M ${endX} ${y}
      L ${endX} ${y - height}
      L ${endX - bracketWidth} ${y - height}
      M ${endX} ${y - height}
      L ${endX} ${y + height}
      L ${endX - bracketWidth} ${y + height}
    `;
  };

  // 缩放控制
  const handleZoom = (delta: number) => {
    setViewState(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale + delta))
    }));
  };

  // 平移控制
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as HTMLElement).tagName === 'rect') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - viewState.offsetX, y: e.clientY - viewState.offsetY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setViewState(prev => ({
        ...prev,
        offsetX: e.clientX - dragStart.x,
        offsetY: e.clientY - dragStart.y
      }));
    }

    // 处理tooltip
    const target = e.target as HTMLElement;
    const eventId = target.getAttribute('data-event-id');
    if (eventId) {
      const event = timelineEvents.find(e => e.id === eventId);
      if (event) {
        setTooltip({
          visible: true,
          x: e.clientX + 10,
          y: e.clientY - 10,
          event
        });
      }
    } else {
      setTooltip(prev => ({ ...prev, visible: false }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 重置视图
  const resetView = () => {
    setViewState({
      scale: 1,
      offsetX: 50,
      offsetY: 80
    });
  };

  // 处理事件点击
  const handleEventClick = (event: TimelineEvent) => {
    setSelectedEvent(event.id);
    if (onEventClick) {
      onEventClick(event.originalEvent);
    }
  };

  // 获取重要性颜色
  const getImportanceColor = (importance: string): string => {
    switch (importance) {
      case 'high': return 'var(--danger-500)';
      case 'normal': return 'var(--primary-500)';
      case 'low': return 'var(--text-muted)';
      default: return 'var(--primary-500)';
    }
  };

  // 滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta);
  };

  if (timelineEvents.length === 0) {
    return (
      <div className="hierarchical-timeline-empty">
        <Clock size={48} strokeWidth={1} />
        <p>暂无时间轴数据</p>
        <span>添加时间节点以查看可视化</span>
      </div>
    );
  }

  return (
    <div className="hierarchical-timeline" ref={containerRef}>
      {/* 工具栏 */}
      <div className="timeline-toolbar">
        <div className="toolbar-group">
          <button onClick={() => handleZoom(0.2)} title="放大">
            <ZoomIn size={18} />
          </button>
          <span className="zoom-level">{Math.round(viewState.scale * 100)}%</span>
          <button onClick={() => handleZoom(-0.2)} title="缩小">
            <ZoomOut size={18} />
          </button>
        </div>
        <div className="toolbar-group">
          <button onClick={resetView} title="重置视图">
            <Maximize2 size={18} />
          </button>
        </div>
        <div className="toolbar-info">
          <Move size={16} />
          <span>拖动平移 · 滚轮缩放</span>
        </div>
      </div>

      {/* 时间轴画布 */}
      <div 
        className="timeline-canvas"
        style={{ height }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <defs>
            {/* 渐变定义 */}
            <linearGradient id="timelineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            
            {/* 阴影滤镜 */}
            <filter id="eventShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
            </filter>
          </defs>

          {/* 主时间轴线 */}
          <line
            x1={timeToX(timeRange.min)}
            y1={timelineConfig.centerY}
            x2={timeToX(timeRange.max)}
            y2={timelineConfig.centerY}
            stroke="url(#timelineGradient)"
            strokeWidth={4}
          />

          {/* 时间刻度 */}
          {ticks.map((tick, index) => (
            <g key={index} className="timeline-tick">
              <line
                x1={tick.x}
                y1={timelineConfig.centerY - 10}
                x2={tick.x}
                y2={timelineConfig.centerY + 10}
                stroke="#94a3b8"
                strokeWidth={2}
              />
              <text
                x={tick.x}
                y={timelineConfig.centerY + 30}
                textAnchor="middle"
                fontSize={12}
                fill="#64748b"
                fontWeight={500}
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* 事件连接线（贝塞尔曲线） */}
          {timelineEvents.map((event, index) => {
            const x = timeToX(event.date);
            const y = getEventY(event.importance, index);
            const color = getImportanceColor(event.importance);
            const isHighlighted = hoveredEvent === event.id || selectedEvent === event.id;

            return (
              <g key={`connection-${event.id}`}>
                {/* 连接线 */}
                <path
                  d={generateBezierPath(x, timelineConfig.centerY, x, y, 0.5)}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHighlighted ? 3 : 1.5}
                  strokeOpacity={isHighlighted ? 1 : 0.4}
                  strokeDasharray={event.importance === 'low' ? '5,5' : 'none'}
                  className="event-connection"
                  data-event-id={event.id}
                  onMouseEnter={() => setHoveredEvent(event.id)}
                  onMouseLeave={() => setHoveredEvent(null)}
                />

                {/* 时间跨度括号（如果有持续时间） */}
                {event.duration && (
                  <path
                    d={generateBracketPath(
                      timeToX(event.duration.start),
                      timeToX(event.duration.end),
                      y
                    )}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    strokeOpacity={0.6}
                  />
                )}
              </g>
            );
          })}

          {/* 事件节点 */}
          {timelineEvents.map((event, index) => {
            const x = timeToX(event.date);
            const y = getEventY(event.importance, index);
            const color = getImportanceColor(event.importance);
            const isHighlighted = hoveredEvent === event.id || selectedEvent === event.id;
            const radius = event.importance === 'high' ? 12 : event.importance === 'normal' ? 10 : 8;

            return (
              <g
                key={`node-${event.id}`}
                className={`event-node ${isHighlighted ? 'highlighted' : ''}`}
                data-event-id={event.id}
                onMouseEnter={() => setHoveredEvent(event.id)}
                onMouseLeave={() => setHoveredEvent(null)}
                onClick={() => handleEventClick(event)}
                style={{ cursor: 'pointer' }}
              >
                {/* 外圈光晕 */}
                {isHighlighted && (
                  <circle
                    cx={x}
                    cy={y}
                    r={radius + 8}
                    fill={color}
                    opacity={0.2}
                  />
                )}

                {/* 主节点圆形 */}
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill={color}
                  stroke="white"
                  strokeWidth={3}
                  filter="url(#eventShadow)"
                />

                {/* 重要性指示器 */}
                <circle
                  cx={x}
                  cy={y}
                  r={radius - 4}
                  fill="none"
                  stroke="white"
                  strokeWidth={2}
                  strokeOpacity={0.5}
                />

                {/* 事件标题 */}
                <g transform={`translate(${x + radius + 10}, ${y})`}>
                  <text
                    y={-5}
                    fontSize={13}
                    fontWeight={600}
                    fill="#1e293b"
                    style={{ pointerEvents: 'none' }}
                  >
                    {event.title.length > 15 
                      ? event.title.substring(0, 15) + '...' 
                      : event.title}
                  </text>
                  <text
                    y={12}
                    fontSize={11}
                    fill="#64748b"
                    style={{ pointerEvents: 'none' }}
                  >
                    {event.dateDisplay}
                  </text>
                </g>

                {/* 页码标记 */}
                <g
                  transform={`translate(${x}, ${y + radius + 15})`}
                  className="page-marker"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onJumpToPage) {
                      onJumpToPage(event.pageNumber);
                    }
                  }}
                >
                  <rect
                    x={-20}
                    y={0}
                    width={40}
                    height={18}
                    rx={9}
                    fill="#f1f5f9"
                    stroke="#cbd5e1"
                    strokeWidth={1}
                  />
                  <text
                    y={12}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#64748b"
                  >
                    p.{event.pageNumber}
                  </text>
                </g>
              </g>
            );
          })}

          {/* 当前时间指示器 */}
          <line
            x1={timeToX(0)}
            y1={50}
            x2={timeToX(0)}
            y2={height - 50}
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="8,4"
            opacity={0.5}
          />
          <text
            x={timeToX(0)}
            y={40}
            textAnchor="middle"
            fontSize={12}
            fill="#ef4444"
            fontWeight={600}
          >
            公元元年
          </text>
        </svg>

        {/* Tooltip */}
        {tooltip.visible && tooltip.event && (
          <div 
            className="timeline-tooltip"
            style={{ 
              left: tooltip.x, 
              top: tooltip.y,
              transform: 'translate(0, -100%)'
            }}
          >
            <div className="tooltip-header">
              <Calendar size={14} />
              <span>{tooltip.event.dateDisplay}</span>
            </div>
            <div className="tooltip-title">{tooltip.event.title}</div>
            {tooltip.event.description && (
              <div className="tooltip-description">
                {tooltip.event.description.length > 100 
                  ? tooltip.event.description.substring(0, 100) + '...'
                  : tooltip.event.description}
              </div>
            )}
            <div className="tooltip-footer">
              <span className="page-info">
                <MapPin size={12} />
                第{tooltip.event.pageNumber}页
              </span>
              {tooltip.event.tags && tooltip.event.tags.length > 0 && (
                <span className="tags-info">
                  <Tag size={12} />
                  {tooltip.event.tags.slice(0, 3).join(', ')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 图例 */}
      <div className="timeline-legend">
        <div className="legend-title">
          <Info size={14} />
          图例说明
        </div>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-dot" style={{ background: 'var(--danger-500)', width: 12, height: 12 }}></div>
            <span>重要事件</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: 'var(--primary-500)', width: 10, height: 10 }}></div>
            <span>普通事件</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: 'var(--text-muted)', width: 8, height: 8 }}></div>
            <span>次要事件</span>
          </div>
          <div className="legend-item">
            <div className="legend-line dashed"></div>
            <span>虚线连接</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HierarchicalTimeline;
