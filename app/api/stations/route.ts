import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { queryStations } from '../../../lib/queries/stations';

export const runtime = 'nodejs';

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const hasData = searchParams.get('hasData');
    const page = parsePositiveInt(searchParams.get('page'), 1, Number.MAX_SAFE_INTEGER);
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), 200, 1000);

    const result = await queryStations({ q, hasData, page, pageSize });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to query stations.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
