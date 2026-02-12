import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

export const runtime = "nodejs";

type StationEventSummaryRow = {
  total_events: number;
  first_start_time: string | null;
  last_end_time: string | null;
  min_peak_time: string | null;
  max_peak_time: string | null;
  max_peak_value: number | null;
  avg_peak_value: number | null;
  avg_rise_time: number | null;
  avg_fall_time: number | null;
};

type StationRecentEventRow = {
  id: number;
  start_time: string | null;
  peak_time: string | null;
  end_time: string | null;
  start_value: number | null;
  peak_value: number | null;
  end_value: number | null;
  rise_time: number | null;
  fall_time: number | null;
  peak_time_str: string | null;
};

function parseLimit(value: string | null): number {
  if (!value) {
    return 20;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(parsed, 100);
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
}

function parseDateOnly(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

const summaryStmt = db.prepare(`
  SELECT
    COUNT(*) AS total_events,
    MIN(start_time) AS first_start_time,
    MAX(end_time) AS last_end_time,
    MIN(peak_time) AS min_peak_time,
    MAX(peak_time) AS max_peak_time,
    MAX(peak_value) AS max_peak_value,
    AVG(peak_value) AS avg_peak_value,
    AVG(rise_time) AS avg_rise_time,
    AVG(fall_time) AS avg_fall_time
  FROM station_records
  WHERE station_id = ?
`);

const matchedEventsBetweenStmt = db.prepare(`
  SELECT COUNT(*) AS matched_events
  FROM station_records
  WHERE station_id = ?
    AND peak_time >= ?
    AND peak_time <= ?
`);

const matchedEventsFromStmt = db.prepare(`
  SELECT COUNT(*) AS matched_events
  FROM station_records
  WHERE station_id = ?
    AND peak_time >= ?
`);

const matchedEventsToStmt = db.prepare(`
  SELECT COUNT(*) AS matched_events
  FROM station_records
  WHERE station_id = ?
    AND peak_time <= ?
`);

const recentEventsStmt = db.prepare(`
  SELECT
    id,
    start_time,
    peak_time,
    end_time,
    start_value,
    peak_value,
    end_value,
    rise_time,
    fall_time,
    peak_time_str
  FROM station_records
  WHERE station_id = ?
  ORDER BY peak_time DESC
  LIMIT ?
`);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ stationId: string }> | { stationId: string } },
) {
  try {
    const { stationId } = await Promise.resolve(context.params);
    const cleanStationId = stationId?.trim();

    if (!cleanStationId) {
      return NextResponse.json({ error: "stationId is required." }, { status: 400 });
    }

    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const includeRecent = parseBoolean(
      req.nextUrl.searchParams.get("includeRecent"),
      true,
    );
    const countOnly = parseBoolean(req.nextUrl.searchParams.get("countOnly"), false);

    const peakStartRaw = parseDateOnly(req.nextUrl.searchParams.get("peakStart"));
    const peakEndRaw = parseDateOnly(req.nextUrl.searchParams.get("peakEnd"));

    let peakStart = peakStartRaw;
    let peakEnd = peakEndRaw;
    if (peakStart && peakEnd && peakStart > peakEnd) {
      [peakStart, peakEnd] = [peakEnd, peakStart];
    }

    const summary = summaryStmt.get(cleanStationId) as StationEventSummaryRow;
    const totalEvents = summary.total_events ?? 0;

    const startTs = peakStart ? `${peakStart} 00:00:00` : null;
    const endTs = peakEnd ? `${peakEnd} 23:59:59` : null;

    let matchedEvents = totalEvents;
    if (startTs && endTs) {
      matchedEvents = (
        matchedEventsBetweenStmt.get(
          cleanStationId,
          startTs,
          endTs,
        ) as { matched_events: number }
      ).matched_events;
    } else if (startTs) {
      matchedEvents = (
        matchedEventsFromStmt.get(cleanStationId, startTs) as {
          matched_events: number;
        }
      ).matched_events;
    } else if (endTs) {
      matchedEvents = (
        matchedEventsToStmt.get(cleanStationId, endTs) as { matched_events: number }
      ).matched_events;
    }

    if (countOnly) {
      return NextResponse.json({
        stationId: cleanStationId,
        matchedEvents,
      });
    }

    const recentEvents = includeRecent
      ? (recentEventsStmt.all(cleanStationId, limit) as StationRecentEventRow[])
      : [];

    return NextResponse.json({
      stationId: cleanStationId,
      summary: {
        totalEvents,
        matchedEvents,
        firstStartTime: summary.first_start_time,
        lastEndTime: summary.last_end_time,
        minPeakTime: summary.min_peak_time,
        maxPeakTime: summary.max_peak_time,
        maxPeakValue: summary.max_peak_value,
        avgPeakValue: summary.avg_peak_value,
        avgRiseTime: summary.avg_rise_time,
        avgFallTime: summary.avg_fall_time,
      },
      recentEvents,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to query station events.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
