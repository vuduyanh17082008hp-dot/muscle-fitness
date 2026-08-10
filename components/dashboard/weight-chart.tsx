'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { DashboardData } from '@/features/dashboard/types'

type WeightChartProps = {
  data: DashboardData['weightTrend']
}

function formatShortDate(
  value: string,
) {
  return new Intl.DateTimeFormat(
    'en-SG',
    {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    },
  ).format(
    new Date(
      `${value}T00:00:00Z`,
    ),
  )
}

export function WeightChart({
  data,
}: WeightChartProps) {
  const chartData = data.map(
    (item) => ({
      ...item,

      label:
        formatShortDate(
          item.date,
        ),
    }),
  )

  const weights =
    chartData.map(
      (item) => item.weightKg,
    )

  const minimum =
    Math.floor(
      Math.min(...weights) - 1,
    )

  const maximum =
    Math.ceil(
      Math.max(...weights) + 1,
    )

  return (
    <div className="h-full min-h-[10rem] w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
      >
        <LineChart
          data={chartData}
          margin={{
            top: 12,
            right: 10,
            left: -20,
            bottom: 0,
          }}
        >
          <CartesianGrid
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
          />

          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{
              fill: '#71717a',
              fontSize: 11,
            }}
            minTickGap={24}
          />

          <YAxis
            domain={[
              minimum,
              maximum,
            ]}
            axisLine={false}
            tickLine={false}
            tick={{
              fill: '#71717a',
              fontSize: 11,
            }}
            width={48}
            unit=" kg"
          />

          <Tooltip
            cursor={{
              stroke:
                'rgba(251,191,36,0.25)',
              strokeWidth: 1,
            }}
            contentStyle={{
              background: '#0b0d10',
              border:
                '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              color: '#ffffff',
              fontSize: 12,
            }}
            formatter={(value) => [
              `${Number(value).toFixed(1)} kg`,
              'Weight',
            ]}
            labelStyle={{
              color: '#a1a1aa',
              marginBottom: 4,
            }}
          />

          <Line
            type="monotone"
            dataKey="weightKg"
            stroke="#fbbf24"
            strokeWidth={3}
            dot={{
              fill: '#fbbf24',
              stroke: '#111318',
              strokeWidth: 3,
              r: 4,
            }}
            activeDot={{
              r: 6,
              fill: '#fde68a',
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}