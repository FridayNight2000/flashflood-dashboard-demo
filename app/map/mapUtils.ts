import type { Station } from "../types/index";

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function stationDisplayName(station: Station): string {
  return (
    station.station_name ||
    station.station_name2 ||
    station.station_name3 ||
    "Unknown station"
  );
}

export function findBestGroupName(
  groups: Map<string, Station[]>,
  keyword: string,
): string | null {
  const names = Array.from(groups.keys());
  const normalizedKeyword = normalizeText(keyword);

  const exact = names.find((name) => normalizeText(name) === normalizedKeyword);
  if (exact) {
    return exact;
  }

  const startsWith = names.find((name) =>
    normalizeText(name).startsWith(normalizedKeyword),
  );
  if (startsWith) {
    return startsWith;
  }

  const includes = names.find((name) =>
    normalizeText(name).includes(normalizedKeyword),
  );
  return includes ?? null;
}
