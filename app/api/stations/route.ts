import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../lib/db";

export const runtime = "nodejs";

type StationRow = {
  station_id: string;
  latitude: number | null;
  longitude: number | null;
  basin_name: string | null;
  river_name: string | null;
  station_name: string | null;
  station_name2: string | null;
  station_name3: string | null;
  has_data: number;
};

function parsePositiveInt(
  value: string | null,
  fallback: number,
  max: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = searchParams.get("q")?.trim() ?? "";
    const hasData = searchParams.get("hasData");
    const page = parsePositiveInt(
      searchParams.get("page"),
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 200, 1000);
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: Array<string | number> = [];

    if (q) {
      whereClauses.push(
        "(station_id LIKE ? OR station_name LIKE ? OR station_name2 LIKE ? OR station_name3 LIKE ? OR river_name LIKE ? OR basin_name LIKE ?)",
      );
      const keyword = `%${q}%`;
      params.push(keyword, keyword, keyword, keyword, keyword, keyword);
    }

    if (hasData === "1" || hasData === "0") {
      whereClauses.push("has_data = ?");
      params.push(Number(hasData));
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const totalStmt = db.prepare(
      `SELECT COUNT(*) AS total FROM stations ${whereSql}`,
    );
    const totalResult = totalStmt.get(...params) as { total: number };
    const total = totalResult.total;

    const listStmt = db.prepare(
      `SELECT
         station_id,
         latitude,
         longitude,
         basin_name,
         river_name,
         station_name,
         station_name2,
         station_name3,
         description,
         has_data
       FROM stations
       ${whereSql}
       ORDER BY has_data DESC, station_id ASC
       LIMIT ? OFFSET ?`,
    );

    const items = listStmt.all(...params, pageSize, offset) as StationRow[];

    return NextResponse.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to query stations.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
