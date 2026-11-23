'use client';

import { useId, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { shown } from '@/lib/report-utils';

const palette = {
  blue: '#0052FF',
  purple: '#8B5CF6',
  teal: '#10B981',
  grey: '#E2E8F0',
  grid: '#F1F5F9',
  label: '#64748B',
};
const tick = { fill: palette.label, fontSize: 12 };
const tooltipStyle = {
  border: '1px solid #E2E8F0',
  borderRadius: 12,
  background: '#fff',
  boxShadow: '0 8px 22px rgba(15, 23, 42, 0.08)',
  padding: '10px 14px',
};

export type ActivityPoint = {
  month: string;
  users: number;
  organizations: number;
  memberships: number;
};

const series = [
  { key: 'users', label: 'New Users', color: 'var(--admin-series-users)' },
  { key: 'memberships', label: 'New Memberships', color: 'var(--admin-series-memberships)' },
  { key: 'organizations', label: 'New Organizations', color: 'var(--admin-series-organizations)' },
] as const;

export function ActivityTrend({ points }: { points?: ActivityPoint[] | undefined }) {
  const gradientPrefix = useId();
  const [months, setMonths] = useState<3 | 6>(6);
  const [active, setActive] = useState<(typeof series)[number]['key'][]>(
    series.map(({ key }) => key),
  );
  const visible = series.filter(({ key }) => active.includes(key));
  
  const data = points?.slice(-months) ?? [];
  const chartTitle = 'Activity trends';

  return (
    <section className="analytics-panel activity-trend-card" aria-label={chartTitle}>
      <div className="analytics-panel-heading">
        <div className="heading-with-icon">
          <span className="panel-heading-icon trend-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </span>
          <div>
            <h3>{chartTitle}</h3>
            <p>New accounts, memberships and organizations</p>
          </div>
        </div>
        {data.length > 0 && <div className="analytics-switch" role="group" aria-label="Activity period">
          {([3, 6] as const).map((period) => (
            <button
              key={period}
              type="button"
              className={months === period ? 'active-pill' : 'inactive-pill'}
              aria-pressed={months === period}
              onClick={() => setMonths(period)}
            >
              {period} Months
            </button>
          ))}
        </div>}
      </div>
      {data.length === 0 ? (
        <p className="analytics-empty">Activity data is unavailable.</p>
      ) : <>
        <div className="analytics-series" role="group" aria-label="Activity series">
          {series.map(({ key, label, color }) => (
            <button
              key={key}
              type="button"
              className="series-toggle-btn"
              aria-pressed={active.includes(key)}
              onClick={() =>
                setActive((current) =>
                  current.includes(key)
                    ? current.length > 1
                      ? current.filter((entry) => entry !== key)
                      : current
                    : [...current, key],
                )
              }
            >
              <i aria-hidden="true" style={{ background: color }} />
              {label}
            </button>
          ))}
        </div>
        <div className="analytics-plot analytics-trend-plot">
          <ResponsiveContainer width="100%" height={228} minWidth={0}>
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{ top: 15, right: 16, bottom: 0, left: -5 }}
            >
              <defs>
                {visible.map(({ key, color }) => (
                  <linearGradient key={key} id={gradientPrefix + key} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.01} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke="var(--admin-line)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: 'var(--admin-copy)', fontSize: 12, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
                tickMargin={10}
              />
              <YAxis
                allowDecimals={false}
                width={35}
                tick={{ fill: 'var(--admin-copy)', fontSize: 12, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ ...tooltipStyle, background: 'var(--admin-raised)', borderColor: 'var(--admin-line)' }}
                labelStyle={{ color: 'var(--admin-ink)' }}
                itemStyle={{ color: 'var(--admin-ink)' }}
                cursor={{ stroke: 'var(--admin-accent)', strokeDasharray: '4 4' }}
              />
              {visible.map(({ key, label, color }) => (
                <Area
                  key={key}
                  name={label}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={3}
                  fill={'url(#' + gradientPrefix + key + ')'}
                  fillOpacity={1}
                  dot={{ r: 4, fill: 'var(--admin-panel)', stroke: color, strokeWidth: 2.5 }}
                  activeDot={{ r: 6, fill: color, stroke: 'var(--admin-panel)', strokeWidth: 2 }}
                  isAnimationActive="auto"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <details className="analytics-data">
          <summary>View monthly counts</summary>
          <table className="super-trend-table">
            <thead>
              <tr><th scope="col">Month</th>{visible.map(({ key, label }) => <th key={key} scope="col">{label}</th>)}</tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.month}>
                  <th scope="row">{point.month}</th>
                  {visible.map(({ key }) => <td key={key}>{point[key].toLocaleString('en-IN')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </>}
    </section>
  );
}

export function OrganizationReadiness({ active, total }: { active: number; total: number }) {
  const count = Math.max(total, 0);
  const effectiveActive = Math.min(Math.max(active, 0), count);
  const other = count - effectiveActive;
  const pct = count === 0 ? 0 : Math.round((effectiveActive / count) * 100);

  // SVG circular progress calculation
  // Radius 58, Circumference = 2 * PI * 58 ≈ 364.425
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct / 100);

  return (
    <section className="analytics-panel readiness-panel" aria-label="Organization readiness">
      <div className="analytics-panel-heading">
        <div className="heading-with-icon">
          <span className="panel-heading-icon readiness-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </span>
          <div>
            <h3>Organization Readiness</h3>
            <p>Active organizations across the platform</p>
          </div>
        </div>
      </div>

      {count === 0 ? (
        <p className="analytics-empty">No organizations registered yet.</p>
      ) : <div className="modern-donut-card-body">
        <div className="modern-donut-wrapper">
          <svg
            className="modern-donut-svg"
            viewBox="0 0 160 160"
            width="170"
            height="170"
            role="img"
            aria-label={`Organization readiness: ${pct}% active`}
          >
            {/* Background Track */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="var(--admin-line)"
              strokeWidth="14"
            />
            {/* Active Arc */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="var(--admin-active)"
              strokeWidth="14"
              strokeLinecap="round"
              visibility={effectiveActive === 0 ? 'hidden' : undefined}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform="rotate(-90 80 80)"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
            {/* Centered Percentage */}
            <text
              x="80"
              y="74"
              textAnchor="middle"
              dominantBaseline="central"
              className="donut-svg-pct"
            >
              {pct}%
            </text>
            {/* Centered Subtitle */}
            <text
              x="80"
              y="97"
              textAnchor="middle"
              dominantBaseline="central"
              className="donut-svg-label"
            >
              Active
            </text>
          </svg>
        </div>

        <div className="analytics-ring-breakdown">
          <div className="breakdown-row">
            <span className="dot-label">
              <span className="legend-bullet bullet-active" />
              Active
            </span>
            <span className="breakdown-val">{active}</span>
          </div>
          <div className="breakdown-row">
            <span className="dot-label">
              <span className="legend-bullet bullet-inactive" />
              Other Status
            </span>
            <span className="breakdown-val">{other}</span>
          </div>
        </div>
      </div>}
    </section>
  );
}

export function ReportBars({
  title,
  description,
  rows,
  unit,
  color = palette.purple,
}: {
  title: string;
  description?: string;
  rows: { label: string; value: number | string }[];
  unit: string;
  color?: string;
}) {
  const published = rows.filter(({ value }) => typeof value === 'number' && Number.isFinite(value));
  const limited =
    published.length > 8
      ? published.sort((first, second) => Number(second.value) - Number(first.value)).slice(0, 8)
      : published;
  const withheld = rows.length - published.length;
  const hasValues = limited.some(({ value }) => value !== 0);
  return (
    <section className="analytics-panel report-chart" aria-label={title}>
      <div className="analytics-panel-heading">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
      </div>
      {hasValues ? (
        <div className="analytics-plot" style={{ height: Math.max(174, limited.length * 33 + 35) }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart accessibilityLayer data={limited} layout="vertical" margin={{ right: 12 }}>
              <CartesianGrid stroke={palette.grid} strokeDasharray="4 5" horizontal={false} />
              <XAxis
                type="number"
                tick={tick}
                axisLine={false}
                tickLine={false}
                allowDecimals={unit === 'Hours' || unit === 'Credits'}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={112}
                tick={tick}
                axisLine={false}
                tickLine={false}
                tickFormatter={(label: string) =>
                  label.length > 16 ? label.slice(0, 15) + '…' : label
                }
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: '#f2f4fa' }}
                formatter={(value) => [typeof value === 'number' ? shown(value) : value, unit]}
              />
              <Bar
                name={unit}
                dataKey="value"
                fill={color}
                radius={[0, 5, 5, 0]}
                maxBarSize={16}
                isAnimationActive="auto"
                animationDuration={525}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="analytics-empty">
          {withheld ? 'No chartable figures in this breakdown.' : 'No activity in this period.'}
        </p>
      )}
      {(withheld > 0 || published.length > limited.length) && (
        <p className="analytics-note">
          {withheld > 0 && 'Withheld figures appear in the detailed table. '}
          {published.length > limited.length &&
            'The chart shows the eight highest published values.'}
        </p>
      )}
    </section>
  );
}
