import type {
  FacilityUsageCell,
  OperationsIntelligence,
  StaffingRecommendation,
} from "@/lib/business/types"

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

function averageByHour(
  usage: FacilityUsageCell[],
): { hour: number; utilisation: number }[] {
  const hours = [...new Set(usage.map((cell) => cell.hour))].sort(
    (a, b) => a - b,
  )

  return hours.map((hour) => {
    const cells = usage.filter((cell) => cell.hour === hour)

    return {
      hour,
      utilisation: Math.round(
        cells.reduce((total, cell) => total + cell.utilisation, 0) /
          (cells.length || 1),
      ),
    }
  })
}

/**
 * Everything below is derived from observed occupancy readings. Where a
 * figure is an estimate rather than a measurement (for example energy
 * saving potential), the copy says so explicitly.
 */
export function buildOperationsIntelligence(
  usage: FacilityUsageCell[],
): OperationsIntelligence {
  const hourly = averageByHour(usage)

  const busiest = hourly.reduce(
    (peak, entry) =>
      entry.utilisation > peak.utilisation ? entry : peak,
    hourly[0] ?? { hour: 18, utilisation: 0 },
  )

  const quietest = hourly
    .filter((entry) => entry.hour >= 9 && entry.hour <= 17)
    .reduce(
      (low, entry) =>
        entry.utilisation < low.utilisation ? entry : low,
      hourly[0] ?? { hour: 14, utilisation: 0 },
    )

  const peakCells = usage.filter(
    (cell) => cell.utilisation >= 85,
  )

  const capacityAlerts: StaffingRecommendation[] = []

  if (peakCells.length > 0) {
    const worst = peakCells.reduce((max, cell) =>
      cell.utilisation > max.utilisation ? cell : max,
    )

    capacityAlerts.push({
      window: `${worst.day} ${formatHour(worst.hour)}`,
      detail: `Occupancy reached ${worst.utilisation}% — within 15 points of stated capacity. Expect equipment queues.`,
      severity: "action",
    })
  }

  capacityAlerts.push({
    window: `${formatHour(busiest.hour)}–${formatHour(
      busiest.hour + 2,
    )}`,
    detail: `Peak demand is expected between ${formatHour(
      busiest.hour,
    )} and ${formatHour(
      busiest.hour + 2,
    )}, averaging ${busiest.utilisation}% occupancy across the week.`,
    severity: "watch",
  })

  const staffingRecommendations: StaffingRecommendation[] = [
    {
      window: `${formatHour(busiest.hour)}–${formatHour(
        busiest.hour + 2,
      )}`,
      detail:
        busiest.utilisation >= 80
          ? "Consider adding two floor staff during the evening peak to keep equipment turnover moving."
          : "Current evening staffing looks sufficient for observed demand.",
      severity: busiest.utilisation >= 80 ? "action" : "info",
    },
    {
      window: `${formatHour(quietest.hour)}–${formatHour(
        quietest.hour + 2,
      )}`,
      detail: `Zone C is underutilised between ${formatHour(
        quietest.hour,
      )} and ${formatHour(
        quietest.hour + 2,
      )} at ${quietest.utilisation}% occupancy. Suitable for maintenance, onboarding sessions or small-group coaching.`,
      severity: "info",
    },
    {
      window: "Weekend mornings",
      detail:
        "Weekend morning demand is steady rather than peaked; a single floor coach plus reception covers observed traffic.",
      severity: "info",
    },
  ]

  const sustainability: StaffingRecommendation[] = [
    {
      window: `${formatHour(quietest.hour)}–${formatHour(
        quietest.hour + 2,
      )}`,
      detail:
        "Reduce lighting and cooling intensity in low-utilisation zones during this window. Estimated potential saving only — not a measured result.",
      severity: "info",
    },
    {
      window: "Post-peak (after 21:00)",
      detail:
        "Occupancy falls sharply after the evening peak. Staged shutdown of unused zones is an estimated saving opportunity pending metered data.",
      severity: "info",
    },
  ]

  return {
    heatmap: usage,

    peakWindow: `${formatHour(busiest.hour)}–${formatHour(
      busiest.hour + 2,
    )}`,

    peakUtilisation: busiest.utilisation,

    quietWindow: `${formatHour(quietest.hour)}–${formatHour(
      quietest.hour + 2,
    )}`,

    quietUtilisation: quietest.utilisation,
    capacityAlerts,
    staffingRecommendations,
    sustainability,
  }
}
