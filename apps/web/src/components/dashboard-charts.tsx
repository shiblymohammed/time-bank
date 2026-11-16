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
  violet: '#6836d8',
  teal: '#087f76',
  blue: '#2c67b7',
  grey: '#dfe4ed',
  grid: '#e8eaf2',
  label: '#616b81',
};
const tick = { fill: palette.label, fontSize: 12 };
const tooltipStyle = {
  border: '1px solid #e3e6ef',
  borderRadius: 12,
  background: '#fff',
  boxShadow: '0 8px 22px #23334f16',
  padding: '10px 14px',
};

export type ActivityPoint = {
  month: string;
  users: number;
  organizations: number;
  memberships: number;
};

const series = [
  { key: 'users', label: 'New users', color: palette.violet },
  { key: 'memberships', label: 'New memberships', color: palette.blue },
  { key: 'organizations', label: 'New organizations', color: palette.teal },
] as const;

export function ActivityTrend({ points }: { points?: ActivityPoint[] | undefined }) {
  const gradientPrefix = useId();
  const [months, setMonths] = useState<3 | 6>(6);
  const [active, setActive] = useState<(typeof series)[number]['key'][]>(
    series.map(({ key }) => key),
  );
  const visible = series.filter(({ key }) => active.includes(key));
  const data = points?.slice(-months) ?? [];
  const chartTitle = 'Monthly activity';

  return (
    <section className="analytics-panel activity-trend-card" aria-label={chartTitle}>
      <div className="analytics-panel-heading">
        <div>
          <h3>{chartTitle}</h3>
          <p>New users, memberships and organizations by month</p>
        </div>
        {Boolean(data.length) && (
          <div className="analytics-switch" role="group" aria-label="Activity period">
            {([3, 6] as const).map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={months === period}
                onClick={() => setMonths(period)}
              >
                {period} months
              </button>
            ))}
          </div>
        )}
      </div>
      {data.length === 0 ? (
        <p className="analytics-empty">Monthly activity is unavailable.</p>
      ) : (
        <>
          <div className="analytics-series" role="group" aria-label="Activity series">
            {series.map(({ key, label, color }) => (
              <button
                key={key}
                type="button"
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
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart
                accessibilityLayer
                data={data}
                margin={{ top: 10, right: 16, bottom: 0, left: 0 }}
              >
                <defs>
                  {visible.map(({ key, color }) => (
                    <linearGradient key={key} id={gradientPrefix + key} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.015} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke={palette.grid} strokeDasharray="4 5" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={9}
                />
                <YAxis
                  allowDecimals={false}
                  width={35}
                  tick={tick}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ stroke: '#9da5b9', strokeDasharray: '4 4' }}
                />
                {visible.map(({ key, label, color }) => (
                  <Area
                    key={key}
                    name={label}
                    type="linear"
                    dataKey={key}
                    stroke={color}
                    strokeWidth={2.5}
                    fill={'url(#' + gradientPrefix + key + ')'}
                    fillOpacity={1}
                    dot={{ r: 2.5, fill: '#fff', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive="auto"
                    animationDuration={600}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <details className="analytics-data">
            <summary>View monthly figures</summary>
            <div className="table-container">
              <table className="custom-table" aria-label="Monthly activity figures">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    {visible.map(({ key, label }) => (
                      <th key={key} scope="col">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.month}>
                      <th scope="row">{row.month}</th>
                      {visible.map(({ key }) => (
                        <td key={key}>{shown(row[key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function OrganizationReadiness({ active, total }: { active: number; total: number }) {
  const other = Math.max(0, total - active);
  const slices = [
    { name: 'Active', value: active, fill: palette.violet },
    { name: 'Other status', value: other, fill: palette.grey },
  ];
  return (
    <section className="analytics-panel readiness-panel" aria-label="Organization readiness">
      <div className="analytics-panel-heading">
        <div>
          <h3>Organization readiness</h3>
          <p>Active organizations across the platform</p>
        </div>
      </div>
      {total ? (
        <>
          <div className="analytics-ring">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart accessibilityLayer>
                <Pie
                  data={slices.filter(({ value }) => value > 0)}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="72%"
                  outerRadius="90%"
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                  isAnimationActive="auto"
                  animationDuration={600}
                />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="analytics-ring-label">
              <strong>{Math.round((active / total) * 100)}%</strong>
              <span>Active</span>
            </div>
          </div>
          <dl className="analytics-ring-legend">
            {slices.map(({ name, value, fill }) => (
              <div key={name}>
                <dt>
                  <i aria-hidden="true" style={{ background: fill }} />
                  {name}
                </dt>
                <dd>{shown(value)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="analytics-empty">No organizations registered.</p>
      )}
    </section>
  );
}

export function ReportBars({
  title,
  description,
  rows,
  unit,
  color = palette.violet,
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
