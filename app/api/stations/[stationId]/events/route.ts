import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  queryStationFilteredSummary,
  queryStationMatchedEvents,
  queryStationMatchedSeries,
  queryStationRecentEvents,
  queryStationSummary,
} from '../../../../../lib/queries/events';

export const runtime = 'nodejs';

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
  return value === '1' || value.toLowerCase() === 'true';
}

function parseDateOnly(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ stationId: string }> }) {
  try {
    const { stationId } = await context.params;
    const cleanStationId = stationId?.trim();

    if (!cleanStationId) {
      return NextResponse.json({ error: 'stationId is required.' }, { status: 400 });
    }

    const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
    const includeRecent = parseBoolean(req.nextUrl.searchParams.get('includeRecent'), true);
    const includeMatchedSeries = parseBoolean(
      req.nextUrl.searchParams.get('includeMatchedSeries'),
      false,
    );
    const includeMatchedEvents = parseBoolean(
      req.nextUrl.searchParams.get('includeMatchedEvents'),
      false,
    );
    const countOnly = parseBoolean(req.nextUrl.searchParams.get('countOnly'), false);

    const peakStartRaw = parseDateOnly(req.nextUrl.searchParams.get('peakStart'));
    const peakEndRaw = parseDateOnly(req.nextUrl.searchParams.get('peakEnd'));

    let peakStart = peakStartRaw;
    let peakEnd = peakEndRaw;
    if (peakStart && peakEnd && peakStart > peakEnd) {
      [peakStart, peakEnd] = [peakEnd, peakStart];
    }

    const startTs = peakStart ? `${peakStart} 00:00:00` : null;
    const endTs = peakEnd ? `${peakEnd} 23:59:59` : null;
    const filter = {
      stationId: cleanStationId,
      startTs,
      endTs,
    };

    const filteredSummary = await queryStationFilteredSummary(filter);
    const matchedEvents = filteredSummary.matchedEvents ?? 0;

    if (countOnly) {
      return NextResponse.json({
        stationId: cleanStationId,
        matchedEvents,
      });
    }

    const summary = await queryStationSummary(cleanStationId);
    const totalEvents = summary.totalEvents ?? 0;

    const recentEvents = includeRecent ? await queryStationRecentEvents(cleanStationId, limit) : [];
    let matchedSeries: Awaited<ReturnType<typeof queryStationMatchedSeries>> | undefined;
    if (includeMatchedSeries) {
      matchedSeries = await queryStationMatchedSeries(filter);
    }

    let matchedEventsDetail: Awaited<ReturnType<typeof queryStationMatchedEvents>> | undefined;
    if (includeMatchedEvents) {
      matchedEventsDetail = await queryStationMatchedEvents(filter);
    }

    return NextResponse.json({
      stationId: cleanStationId,
      summary: {
        totalEvents,
        matchedEvents,
        firstStartTime: summary.firstStartTime,
        lastEndTime: summary.lastEndTime,
        minPeakTime: summary.minPeakTime,
        maxPeakTime: summary.maxPeakTime,
        maxPeakValue: filteredSummary.maxPeakValue,
        avgPeakValue: filteredSummary.avgPeakValue,
        avgRiseTime: filteredSummary.avgRiseTime,
        avgFallTime: filteredSummary.avgFallTime,
      },
      recentEvents,
      matchedSeries,
      matchedEventsDetail,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to query station events.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
