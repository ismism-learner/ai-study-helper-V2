import React, { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, ColorType } from 'lightweight-charts';
import type { IChartApi, DeepPartial, ChartOptions } from 'lightweight-charts';

interface CandlestickDataItem {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VolumeDataItem {
  time: string;
  value: number;
  color?: string;
}

interface ChartConfig {
  title?: string;
  type?: string;
  data: CandlestickDataItem[];
  volume?: VolumeDataItem[];
}

interface FinancialChartBlockProps {
  data: string;
}

const FinancialChartBlock: React.FC<FinancialChartBlockProps> = ({ data }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<ChartConfig | null>(null);

  // Parse JSON data on mount / when data changes
  useEffect(() => {
    try {
      const parsed: ChartConfig = JSON.parse(data);
      if (!parsed.data || !Array.isArray(parsed.data) || parsed.data.length === 0) {
        setError('暂无图表数据');
        setConfig(null);
        return;
      }
      setError(null);
      setConfig(parsed);
    } catch {
      setError('图表数据格式错误');
      setConfig(null);
    }
  }, [data]);

  // Create and manage chart
  useEffect(() => {
    if (!config || !containerRef.current) return;

    const container = containerRef.current;

    try {
      const chartOptions: DeepPartial<ChartOptions> = {
        layout: {
          background: { type: ColorType.Solid, color: 'var(--bg-base)' },
          textColor: 'var(--text-muted)',
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        width: container.clientWidth,
        height: 400,
        timeScale: {
          timeVisible: false,
          borderColor: 'rgba(139, 92, 246, 0.2)',
        },
        rightPriceScale: {
          borderColor: 'rgba(139, 92, 246, 0.2)',
        },
        crosshair: {
          vertLine: { color: 'rgba(139, 92, 246, 0.3)', labelBackgroundColor: 'var(--accent-500)' },
          horzLine: { color: 'rgba(139, 92, 246, 0.3)', labelBackgroundColor: 'var(--accent-500)' },
        },
      };

      const chart = createChart(container, chartOptions);
      chartRef.current = chart;

      // Add candlestick series
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: 'var(--success-500)',
        downColor: 'var(--danger-500)',
        borderDownColor: 'var(--danger-500)',
        borderUpColor: 'var(--success-500)',
        wickDownColor: 'var(--danger-500)',
        wickUpColor: 'var(--success-500)',
      });

      candlestickSeries.setData(config.data);

      // If volume data exists, add histogram series below candlestick
      if (config.volume && config.volume.length > 0) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        });

        volumeSeries.setData(config.volume);

        // Position volume at the bottom 20% of the chart
        volumeSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
        });
      }

      // Fit content to view
      chart.timeScale().fitContent();

      // Handle resize
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          chart.applyOptions({ width, height: height || 400 });
        }
      });

      resizeObserver.observe(container);

      // Cleanup
      return () => {
        resizeObserver.disconnect();
        chart.remove();
        chartRef.current = null;
      };
    } catch {
      setError('图表渲染失败');
      return () => {
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }
      };
    }
  }, [config]);

  // Error state
  if (error) {
    return (
      <div style={{
        background: 'var(--bg-base)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 8,
        padding: 16,
        color: 'var(--danger-500)',
        fontSize: 14,
        marginBottom: 16,
      }}>
        <div style={{ marginBottom: 8, fontWeight: 600 }}>{error}</div>
        <pre style={{
          margin: 0,
          padding: 8,
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 4,
          fontSize: 12,
          color: 'var(--text-muted)',
          overflowX: 'auto',
          maxHeight: 120,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {data}
        </pre>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-base)',
      border: '1px solid rgba(139, 92, 246, 0.2)',
      borderRadius: 8,
      padding: 16,
      marginBottom: 16,
    }}>
      {config?.title && (
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--border-subtle)',
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          {config.title}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: 400 }} />
    </div>
  );
};

export default FinancialChartBlock;
