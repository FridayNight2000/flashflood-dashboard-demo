import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../../lib/db";

export const runtime = "nodejs";

type StationEventSummaryRow = {
  total_events: number;
  first_start_time: string | null;
  last_end_time: string | null;
  min_peak_time: string | null;
  max_peak_time: string | null;
};

type FilteredSummaryRow = {
  matched_events: number;
  max_peak_value: number | null;
  avg_peak_value: number | null;
  avg_rise_time: number | null;
  avg_fall_time: number | null;
};

type StationMatchedPointRow = {
  id: number;
  peak_time: string;
  peak_value: number;
  peak_time_str: string | null;
};

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
    COUNT(sr.id) AS total_events,
    MIN(sr.start_time) AS first_start_time,
    MAX(sr.end_time) AS last_end_time,
    MIN(sr.peak_time) AS min_peak_time,
    MAX(sr.peak_time) AS max_peak_time
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
`);

const filteredSummaryAllStmt = db.prepare(`
  SELECT
    COUNT(sr.id) AS matched_events,
    MAX(sr.peak_value) AS max_peak_value,
    AVG(sr.peak_value) AS avg_peak_value,
    AVG(sr.rise_time) AS avg_rise_time,
    AVG(sr.fall_time) AS avg_fall_time
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
`);

const filteredSummaryBetweenStmt = db.prepare(`
  SELECT
    COUNT(sr.id) AS matched_events,
    MAX(sr.peak_value) AS max_peak_value,
    AVG(sr.peak_value) AS avg_peak_value,
    AVG(sr.rise_time) AS avg_rise_time,
    AVG(sr.fall_time) AS avg_fall_time
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
    AND sr.peak_time >= ?
    AND sr.peak_time <= ?
`);

const filteredSummaryFromStmt = db.prepare(`
  SELECT
    COUNT(sr.id) AS matched_events,
    MAX(sr.peak_value) AS max_peak_value,
    AVG(sr.peak_value) AS avg_peak_value,
    AVG(sr.rise_time) AS avg_rise_time,
    AVG(sr.fall_time) AS avg_fall_time
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
    AND sr.peak_time >= ?
`);

const filteredSummaryToStmt = db.prepare(`
  SELECT
    COUNT(sr.id) AS matched_events,
    MAX(sr.peak_value) AS max_peak_value,
    AVG(sr.peak_value) AS avg_peak_value,
    AVG(sr.rise_time) AS avg_rise_time,
    AVG(sr.fall_time) AS avg_fall_time
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
    AND sr.peak_time <= ?
`);

const matchedSeriesAllStmt = db.prepare(`
  SELECT
    sr.id,
    sr.peak_time,
    sr.peak_value,
    sr.peak_time_str
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
    AND sr.peak_time IS NOT NULL
    AND sr.peak_value IS NOT NULL
  ORDER BY sr.peak_time ASC
`);

const matchedSeriesBetweenStmt = db.prepare(`
  SELECT
    sr.id,
    sr.peak_time,
    sr.peak_value,
    sr.peak_time_str
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
    AND sr.peak_time >= ?
    AND sr.peak_time <= ?
    AND sr.peak_time IS NOT NULL
    AND sr.peak_value IS NOT NULL
  ORDER BY sr.peak_time ASC
`);

const matchedSeriesFromStmt = db.prepare(`
  SELECT
    sr.id,
    sr.peak_time,
    sr.peak_value,
    sr.peak_time_str
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
    AND sr.peak_time >= ?
    AND sr.peak_time IS NOT NULL
    AND sr.peak_value IS NOT NULL
  ORDER BY sr.peak_time ASC
`);

const matchedSeriesToStmt = db.prepare(`
  SELECT
    sr.id,
    sr.peak_time,
    sr.peak_value,
    sr.peak_time_str
  FROM station_records sr
  JOIN stations s ON sr.station_id = s.station_id
  WHERE s.basin_name = ?
    AND sr.peak_time <= ?
    AND sr.peak_time IS NOT NULL
    AND sr.peak_value IS NOT NULL
  ORDER BY sr.peak_time ASC
`);

// Note: Recent events are not as meaningful across a whole basin without extensive filtering,
// but we can expose top events by peak value or time if needed.
// For now, we omit recentEvents for basin view unless specifically requested.

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ basinName: string }> },
) {
  try {
    const { basinName } = await context.params;
    const cleanBasin = decodeURIComponent(basinName).trim();

    if (!cleanBasin) {
      return NextResponse.json(
        { error: "basinName is required." },
        { status: 400 },
      );
    }

    const includeMatchedSeries = parseBoolean(
      req.nextUrl.searchParams.get("includeMatchedSeries"),
      false,
    );
    const countOnly = parseBoolean(
      req.nextUrl.searchParams.get("countOnly"),
      false,
    );

    const peakStartRaw = parseDateOnly(
      req.nextUrl.searchParams.get("peakStart"),
    );
    const peakEndRaw = parseDateOnly(req.nextUrl.searchParams.get("peakEnd"));

    let peakStart = peakStartRaw;
    let peakEnd = peakEndRaw;
    if (peakStart && peakEnd && peakStart > peakEnd) {
      [peakStart, peakEnd] = [peakEnd, peakStart];
    }

    const summary = summaryStmt.get(cleanBasin) as StationEventSummaryRow;
    const totalEvents = summary.total_events ?? 0;

    const startTs = peakStart ? `${peakStart} 00:00:00` : null;
    const endTs = peakEnd ? `${peakEnd} 23:59:59` : null;

    let filteredSummary: FilteredSummaryRow;
    if (startTs && endTs) {
      filteredSummary = filteredSummaryBetweenStmt.get(
        cleanBasin,
        startTs,
        endTs,
      ) as FilteredSummaryRow;
    } else if (startTs) {
      filteredSummary = filteredSummaryFromStmt.get(
        cleanBasin,
        startTs,
      ) as FilteredSummaryRow;
    } else if (endTs) {
      filteredSummary = filteredSummaryToStmt.get(
        cleanBasin,
        endTs,
      ) as FilteredSummaryRow;
    } else {
      filteredSummary = filteredSummaryAllStmt.get(
        cleanBasin,
      ) as FilteredSummaryRow;
    }
    const matchedEvents = filteredSummary.matched_events ?? totalEvents;

    if (countOnly) {
      return NextResponse.json({
        basinName: cleanBasin,
        matchedEvents,
      });
    }

    let matchedSeries: StationMatchedPointRow[] | undefined;
    if (includeMatchedSeries) {
      if (startTs && endTs) {
        matchedSeries = matchedSeriesBetweenStmt.all(
          cleanBasin,
          startTs,
          endTs,
        ) as StationMatchedPointRow[];
      } else if (startTs) {
        matchedSeries = matchedSeriesFromStmt.all(
          cleanBasin,
          startTs,
        ) as StationMatchedPointRow[];
      } else if (endTs) {
        matchedSeries = matchedSeriesToStmt.all(
          cleanBasin,
          endTs,
        ) as StationMatchedPointRow[];
      } else {
        matchedSeries = matchedSeriesAllStmt.all(
          cleanBasin,
        ) as StationMatchedPointRow[];
      }
    }

    return NextResponse.json({
      basinName: cleanBasin,
      summary: {
        totalEvents,
        matchedEvents,
        firstStartTime: summary.first_start_time,
        lastEndTime: summary.last_end_time,
        minPeakTime: summary.min_peak_time,
        maxPeakTime: summary.max_peak_time,
        maxPeakValue: filteredSummary.max_peak_value,
        avgPeakValue: filteredSummary.avg_peak_value,
        avgRiseTime: filteredSummary.avg_rise_time,
        avgFallTime: filteredSummary.avg_fall_time,
      },
      recentEvents: [], // Empty for now as discussed
      matchedSeries,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to query basin events.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
