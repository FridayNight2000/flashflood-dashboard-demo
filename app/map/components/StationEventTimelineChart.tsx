"use client";

import { forwardRef, useMemo } from "react";
import type { StationMatchedPoint } from "../../types/index";

type StationEventTimelineChartProps = {
  points: StationMatchedPoint[];
  width?: number;
  height?: number;
};

type ChartPoint = {
  x: number;
  y: number;
  label: string;
  value: number;
};

const chartMargin = { top: 18, right: 16, bottom: 32, left: 52 };

function formatAxisValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function formatDateTick(ts: number): string {
  const date = new Date(ts);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const StationEventTimelineChart = forwardRef<
  SVGSVGElement,
  StationEventTimelineChartProps
>(function StationEventTimelineChart({ points, width = 640, height = 260 }, ref) {
  const plotWidth = width - chartMargin.left - chartMargin.right;
  const plotHeight = height - chartMargin.top - chartMargin.bottom;
  const safePoints = points.filter(
    (point) =>
      Number.isFinite(Date.parse(point.peak_time)) && Number.isFinite(point.peak_value),
  );

  const chartData = useMemo(() => {
    if (safePoints.length === 0) {
      return {
        points: [] as ChartPoint[],
        xTicks: [] as { x: number; label: string }[],
        yTicks: [] as { y: number; label: string }[],
      };
    }

    const timestamps = safePoints.map((item) => Date.parse(item.peak_time));
    const values = safePoints.map((item) => item.peak_value);

    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const xSpan = Math.max(1, maxTs - minTs);
    const ySpan = Math.max(0.0001, maxValue - minValue);

    const mappedPoints = safePoints.map((item) => {
      const ts = Date.parse(item.peak_time);
      const normalizedX = (ts - minTs) / xSpan;
      const normalizedY = (item.peak_value - minValue) / ySpan;
      return {
        x: chartMargin.left + normalizedX * plotWidth,
        y: chartMargin.top + (1 - normalizedY) * plotHeight,
        label: item.peak_time_str ?? item.peak_time,
        value: item.peak_value,
      };
    });

    const xTicks = Array.from({ length: 5 }).map((_, idx) => {
      const ratio = idx / 4;
      const ts = minTs + ratio * xSpan;
      return {
        x: chartMargin.left + ratio * plotWidth,
        label: formatDateTick(ts),
      };
    });

    const yTicks = Array.from({ length: 5 }).map((_, idx) => {
      const ratio = idx / 4;
      const value = minValue + (1 - ratio) * ySpan;
      return {
        y: chartMargin.top + ratio * plotHeight,
        label: formatAxisValue(value),
      };
    });

    return {
      points: mappedPoints,
      xTicks,
      yTicks,
    };
  }, [safePoints, plotHeight, plotWidth]);

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      role="img"
      aria-label="Event timeline chart"
    >
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
      <rect
        x={chartMargin.left}
        y={chartMargin.top}
        width={plotWidth}
        height={plotHeight}
        fill="#f8fafc"
        stroke="#dbe3ea"
      />
      <line
        x1={chartMargin.left}
        y1={height - chartMargin.bottom}
        x2={width - chartMargin.right}
        y2={height - chartMargin.bottom}
        stroke="#64748b"
        strokeWidth="1"
      />
      <line
        x1={chartMargin.left}
        y1={chartMargin.top}
        x2={chartMargin.left}
        y2={height - chartMargin.bottom}
        stroke="#64748b"
        strokeWidth="1"
      />

      {chartData.xTicks.map((tick) => (
        <g key={`${tick.x}-${tick.label}`}>
          <line
            x1={tick.x}
            y1={chartMargin.top}
            x2={tick.x}
            y2={height - chartMargin.bottom}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text
            x={tick.x}
            y={height - chartMargin.bottom + 16}
            textAnchor="middle"
            fontSize="10"
            fill="#475569"
          >
            {tick.label}
          </text>
        </g>
      ))}

      {chartData.yTicks.map((tick) => (
        <g key={`${tick.y}-${tick.label}`}>
          <line
            x1={chartMargin.left}
            y1={tick.y}
            x2={width - chartMargin.right}
            y2={tick.y}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text
            x={chartMargin.left - 8}
            y={tick.y + 3}
            textAnchor="end"
            fontSize="10"
            fill="#475569"
          >
            {tick.label}
          </text>
        </g>
      ))}

      {chartData.points.map((point, idx) => (
        <circle key={idx} cx={point.x} cy={point.y} r="2.2" fill="#0f766e" opacity="0.9">
          <title>{`${point.label} | ${point.value.toFixed(2)}`}</title>
        </circle>
      ))}

      <text
        x={width / 2}
        y={height - 4}
        textAnchor="middle"
        fontSize="11"
        fill="#334155"
      >
        peak_time
      </text>
      <text
        x={13}
        y={height / 2}
        textAnchor="middle"
        fontSize="11"
        fill="#334155"
        transform={`rotate(-90 13 ${height / 2})`}
      >
        peak_value
      </text>
    </svg>
  );
});

export default StationEventTimelineChart;
