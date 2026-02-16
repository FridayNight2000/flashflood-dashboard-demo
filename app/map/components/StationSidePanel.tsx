"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Station,
  StationMatchedPoint,
  StationEventsApiResponse,
  StationEventSummary,
} from "../../types/index";
import StationEventTimelineChart from "./StationEventTimelineChart";
import styles from "./StationSidePanel.module.css";

type StationSidePanelProps = {
  selectedStation: Station | null;
  selectedBasin?: string | null;
  basinStationCount?: number;
  onCloseStation: () => void;
  onCloseBasin: () => void;
  getDisplayName: (station: Station) => string;
};

function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(2);
}

function toDateOnly(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.slice(0, 10);
}

export default function StationSidePanel({
  selectedStation,
  selectedBasin,
  basinStationCount,
  onCloseStation,
  onCloseBasin,
  getDisplayName,
}: StationSidePanelProps) {
  // 修改备注: 缓存 station_id 对应的聚合结果，避免重复请求
  const cacheRef = useRef<Record<string, StationEventsApiResponse>>({});
  const [eventSummary, setEventSummary] = useState<StationEventSummary | null>(
    null,
  );
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [peakStartDate, setPeakStartDate] = useState("");
  const [peakEndDate, setPeakEndDate] = useState("");
  const [rangeMatchedEvents, setRangeMatchedEvents] = useState<number | null>(
    null,
  );
  const [isLoadingRangeCount, setIsLoadingRangeCount] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [matchedSeries, setMatchedSeries] = useState<StationMatchedPoint[]>([]);
  const chartSvgRef = useRef<SVGSVGElement | null>(null);

  async function handleDownloadPng() {
    if (
      (!selectedStation && !selectedBasin) ||
      !chartSvgRef.current ||
      matchedSeries.length === 0
    ) {
      return;
    }

    const svgEl = chartSvgRef.current;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const blobUrl = URL.createObjectURL(svgBlob);

    try {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to load SVG data."));
      });
      image.src = blobUrl;
      await loaded;

      const scale = 2;
      const width = svgEl.viewBox.baseVal.width || svgEl.clientWidth || 640;
      const height = svgEl.viewBox.baseVal.height || svgEl.clientHeight || 260;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      const a = document.createElement("a");
      const start = rangeStartDate ?? "start";
      const end = rangeEndDate ?? "end";
      a.href = canvas.toDataURL("image/png");

      const filePrefix = selectedStation
        ? selectedStation.station_id
        : `basin_${selectedBasin}`;
      a.download = `${filePrefix}_event_timeline_${start}_${end}.png`;
      a.click();
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  useEffect(() => {
    if (!selectedStation && !selectedBasin) {
      setEventSummary(null);
      setIsLoadingEvents(false);
      setEventsError(null);
      setPeakStartDate("");
      setPeakEndDate("");
      setRangeMatchedEvents(null);
      setIsLoadingRangeCount(false);
      setMatchedSeries([]);
      setIsExpanded(false);
      return;
    }

    const cacheKey = selectedStation
      ? `s:${selectedStation.station_id}`
      : `b:${selectedBasin}`;

    const cached = cacheRef.current[cacheKey];
    if (cached) {
      setEventSummary(cached.summary);
      setRangeMatchedEvents(cached.summary.matchedEvents);
      setIsLoadingEvents(false);
      setEventsError(null);
      setMatchedSeries([]);
      setIsExpanded(false);
      return;
    }
    setEventSummary(null);

    const controller = new AbortController();

    async function fetchEvents() {
      try {
        setIsLoadingEvents(true);
        setEventsError(null);

        const url = selectedStation
          ? `/api/stations/${selectedStation.station_id}/events?includeRecent=0`
          : `/api/basins/${encodeURIComponent(selectedBasin!)}/events?includeRecent=0`;

        const res = await fetch(url, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const data = (await res.json()) as StationEventsApiResponse;
        cacheRef.current[cacheKey] = data;
        setEventSummary(data.summary);
        setRangeMatchedEvents(data.summary.matchedEvents);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setEventsError("Failed to load event summary.");
          setEventSummary(null);
          setRangeMatchedEvents(null);
        }
      } finally {
        setIsLoadingEvents(false);
      }
    }

    fetchEvents();
    return () => controller.abort();
  }, [selectedStation, selectedBasin]);

  // 修改备注: 当摘要加载后，初始化日期范围到全区间
  useEffect(() => {
    const minDate = toDateOnly(eventSummary?.minPeakTime ?? null);
    const maxDate = toDateOnly(eventSummary?.maxPeakTime ?? null);
    if (!minDate || !maxDate) {
      return;
    }
    setPeakStartDate(minDate);
    setPeakEndDate(maxDate);
  }, [eventSummary?.minPeakTime, eventSummary?.maxPeakTime]);

  const minPeakDate = toDateOnly(eventSummary?.minPeakTime ?? null);
  const maxPeakDate = toDateOnly(eventSummary?.maxPeakTime ?? null);
  const rangeStartDate = peakStartDate || minPeakDate;
  const rangeEndDate = peakEndDate || maxPeakDate;

  // 修改备注: 日期区间变化时，按 station_id + peak_time 时间段重查摘要（防抖）
  useEffect(() => {
    if (
      (!selectedStation && !selectedBasin) ||
      !rangeStartDate ||
      !rangeEndDate
    ) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setIsLoadingRangeCount(true);
        const query = new URLSearchParams({
          includeRecent: "0",
          peakStart: rangeStartDate,
          peakEnd: rangeEndDate,
        });
        if (isExpanded) {
          query.set("includeMatchedSeries", "1");
        }

        const url = selectedStation
          ? `/api/stations/${selectedStation.station_id}/events?${query.toString()}`
          : `/api/basins/${encodeURIComponent(selectedBasin!)}/events?${query.toString()}`;

        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as StationEventsApiResponse;
        setEventSummary(data.summary);
        setRangeMatchedEvents(data.summary.matchedEvents);
        setMatchedSeries(data.matchedSeries ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setRangeMatchedEvents(null);
          setMatchedSeries([]);
        }
      } finally {
        setIsLoadingRangeCount(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    selectedStation,
    selectedBasin,
    rangeStartDate,
    rangeEndDate,
    isExpanded,
  ]);

  function renderEventsAnalysis() {
    return (
      <>
        <div className={styles.stationSideDivider} />

        {isLoadingEvents && <p>Loading event summary...</p>}
        {eventsError && <p>{eventsError}</p>}
        {eventSummary && (
          <>
            <p>
              <strong>Flashflood database:</strong>
            </p>
            {minPeakDate && maxPeakDate && (
              <>
                <p>
                  <strong>Peak Time Range:</strong> {rangeStartDate} to{" "}
                  {rangeEndDate}
                </p>
                <div className={styles.sidePanelDateRow}>
                  <input
                    className={styles.sidePanelDateInput}
                    type="date"
                    min={minPeakDate ?? undefined}
                    max={maxPeakDate ?? undefined}
                    value={rangeStartDate ?? ""}
                    onChange={(event) => {
                      const next = event.target.value;
                      setPeakStartDate(next);
                      if (rangeEndDate && next > rangeEndDate) {
                        setPeakEndDate(next);
                      }
                    }}
                  />
                  <input
                    className={styles.sidePanelDateInput}
                    type="date"
                    min={minPeakDate ?? undefined}
                    max={maxPeakDate ?? undefined}
                    value={rangeEndDate ?? ""}
                    onChange={(event) => {
                      const next = event.target.value;
                      setPeakEndDate(next);
                      if (rangeStartDate && next < rangeStartDate) {
                        setPeakStartDate(next);
                      }
                    }}
                  />
                </div>
                <p>
                  <strong>Matched Events:</strong>{" "}
                  {isLoadingRangeCount
                    ? "Loading..."
                    : (rangeMatchedEvents ?? "-")}
                </p>
              </>
            )}
            <p>
              <strong>Max Peak:</strong>{" "}
              {formatNumber(eventSummary.maxPeakValue)}
            </p>
            <p>
              <strong>Avg Peak:</strong>{" "}
              {formatNumber(eventSummary.avgPeakValue)}
            </p>
            <p>
              <strong>Avg Rise Time:</strong>{" "}
              {formatNumber(eventSummary.avgRiseTime)}
            </p>
            <p>
              <strong>Avg Fall Time:</strong>{" "}
              {formatNumber(eventSummary.avgFallTime)}
            </p>
          </>
        )}
      </>
    );
  }

  function renderChartSection() {
    return (
      <section className={styles.chartColumn}>
        <button
          type="button"
          className={styles.timelineHeader}
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <span>Event timeline (peak_time vs peak_value)</span>
          <span>{isExpanded ? "Collapse" : "Expand"}</span>
        </button>
        {isExpanded && (
          <div className={styles.chartCard}>
            {isLoadingRangeCount ? (
              <p>Loading chart...</p>
            ) : matchedSeries.length > 0 ? (
              <>
                <div className={styles.chartCanvas}>
                  <StationEventTimelineChart
                    ref={chartSvgRef}
                    points={matchedSeries}
                  />
                </div>
                <button
                  type="button"
                  className={styles.downloadBtn}
                  onClick={() => void handleDownloadPng()}
                >
                  Download PNG
                </button>
              </>
            ) : (
              <p>No matched events in selected range.</p>
            )}
          </div>
        )}
      </section>
    );
  }

  return (
    <aside
      className={`${styles.stationSidePanel} ${
        selectedStation || selectedBasin ? styles.open : ""
      } ${isExpanded ? styles.panelExpanded : ""}`}
    >
      {selectedStation ? (
        <>
          <div className={styles.stationSidePanelHeader}>
            <h3>{getDisplayName(selectedStation)}</h3>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.stationSideCloseBtn}
                onClick={onCloseStation}
              >
                {selectedBasin ? "Back to Basin" : "Close"}
              </button>
              {selectedBasin && (
                <button
                  type="button"
                  className={styles.stationSideCloseBtn}
                  onClick={onCloseBasin}
                >
                  Close Basin
                </button>
              )}
            </div>
          </div>
          <div className={styles.stationSidePanelBody}>
            <div className={styles.contentSplit}>
              <section className={styles.infoColumn}>
                <p>
                  <strong>ID:</strong> {selectedStation.station_id}
                </p>
                <p>
                  <strong>Basin:</strong> {selectedStation.basin_name || "-"}
                </p>
                <p>
                  <strong>Has Data:</strong>{" "}
                  {selectedStation.has_data === 1 ? "Yes" : "No"}
                </p>

                {renderEventsAnalysis()}
              </section>

              {renderChartSection()}
            </div>
          </div>
        </>
      ) : selectedBasin ? (
        <>
          <div className={styles.stationSidePanelHeader}>
            <h3>Basin: {selectedBasin}</h3>
            <button
              type="button"
              className={styles.stationSideCloseBtn}
              onClick={onCloseBasin}
            >
              Close
            </button>
          </div>
          <div className={styles.stationSidePanelBody}>
            <div className={styles.contentSplit}>
              <section className={styles.infoColumn}>
                <p>
                  <strong>Stations in Basin:</strong> {basinStationCount ?? 0}
                </p>
                {renderEventsAnalysis()}
              </section>

              {renderChartSection()}
            </div>
          </div>
        </>
      ) : (
        <div className={styles.stationSidePanelEmpty}>
          Click a station or search a basin to view details.
        </div>
      )}
    </aside>
  );
}
