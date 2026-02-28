import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  queryBasinSummary,
  queryFilteredSummary,
  queryMatchedEvents,
  queryMatchedSeries,
} from '../../../../../lib/queries/events';

export const runtime = 'nodejs';

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function parseDateOnly(value: string | null) {
  if (!value) return null;
  const t = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export async function GET(req: NextRequest, context: { params: Promise<{ basinName: string }> }) {
  try {
    const { basinName } = await context.params;
    const cleanBasin = decodeURIComponent(basinName).trim();
    if (!cleanBasin) {
      return NextResponse.json({ error: 'basinName is required.' }, { status: 400 });
    }

    const sp = req.nextUrl.searchParams;
    const includeMatchedSeries = parseBoolean(sp.get('includeMatchedSeries'), false);
    const includeMatchedEvents = parseBoolean(sp.get('includeMatchedEvents'), false);
    const countOnly = parseBoolean(sp.get('countOnly'), false);

    let peakStart = parseDateOnly(sp.get('peakStart'));
    let peakEnd = parseDateOnly(sp.get('peakEnd'));
    if (peakStart && peakEnd && peakStart > peakEnd) [peakStart, peakEnd] = [peakEnd, peakStart];

    const startTs = peakStart ? `${peakStart} 00:00:00` : null;
    const endTs = peakEnd ? `${peakEnd} 23:59:59` : null;
    const filter = { basinName: cleanBasin, startTs, endTs };

    const filteredSummary = await queryFilteredSummary(filter);
    const matchedEvents = filteredSummary.matchedEvents ?? 0;

    if (countOnly) {
      return NextResponse.json({ basinName: cleanBasin, matchedEvents });
    }

    const summary = await queryBasinSummary(cleanBasin);
    const totalEvents = summary.totalEvents ?? 0;

    return NextResponse.json({
      basinName: cleanBasin,
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
      recentEvents: [],
      matchedSeries: includeMatchedSeries ? await queryMatchedSeries(filter) : undefined,
      matchedEventsDetail: includeMatchedEvents ? await queryMatchedEvents(filter) : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to query basin events.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
