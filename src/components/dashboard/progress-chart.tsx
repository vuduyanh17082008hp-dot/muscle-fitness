"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { progressSeries } from "@/lib/data";

export function ProgressChart() {
  return (
    <div className="h-72 w-full border border-ink/10 bg-bone p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={progressSeries}>
          <CartesianGrid stroke="#d9d4c8" strokeDasharray="3 3" />
          <XAxis dataKey="week" stroke="#6e7468" fontSize={12} />
          <YAxis stroke="#6e7468" fontSize={12} />
          <Tooltip
            contentStyle={{
              background: "#f3f0e8",
              border: "1px solid #14161122",
              borderRadius: 0,
            }}
          />
          <Line
            type="monotone"
            dataKey="volume"
            stroke="#8fbc00"
            strokeWidth={2}
            dot={false}
            name="Volume"
          />
          <Line
            type="monotone"
            dataKey="strength"
            stroke="#141611"
            strokeWidth={2}
            dot={false}
            name="Strength index"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
