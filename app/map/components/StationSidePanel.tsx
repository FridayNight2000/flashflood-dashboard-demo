"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Station,
  StationEventsCountResponse,
  StationEventsApiResponse,
  StationEventSummary,
} from "../../types/index";

type StationSidePanelProps = {
  selectedStation: Station | null;
  onClose: () => void;
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
  onClose,
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

  useEffect(() => {
    if (!selectedStation) {
      setEventSummary(null);
      setIsLoadingEvents(false);
      setEventsError(null);
      setPeakStartDate("");
      setPeakEndDate("");
      setRangeMatchedEvents(null);
      setIsLoadingRangeCount(false);
      return;
    }

    const stationId = selectedStation.station_id;
    const cached = cacheRef.current[stationId];
    if (cached) {
      setEventSummary(cached.summary);
      setRangeMatchedEvents(cached.summary.matchedEvents);
      setIsLoadingEvents(false);
      setEventsError(null);
      return;
    }
    setEventSummary(null);

    const controller = new AbortController();

    async function fetchStationEvents() {
      try {
        setIsLoadingEvents(true);
        setEventsError(null);

        const res = await fetch(
          `/api/stations/${stationId}/events?includeRecent=0`,
          {
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }

        const data = (await res.json()) as StationEventsApiResponse;
        cacheRef.current[stationId] = data;
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

    fetchStationEvents();
    return () => controller.abort();
  }, [selectedStation]);

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

  // 修改备注: 日期区间变化时，按 station_id + peak_time 时间段查询命中事件数（防抖）
  useEffect(() => {
    if (!selectedStation || !rangeStartDate || !rangeEndDate) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setIsLoadingRangeCount(true);
        const query = new URLSearchParams({
          countOnly: "1",
          peakStart: rangeStartDate,
          peakEnd: rangeEndDate,
        });
        const res = await fetch(
          `/api/stations/${selectedStation.station_id}/events?${query.toString()}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = (await res.json()) as StationEventsCountResponse;
        setRangeMatchedEvents(data.matchedEvents);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setRangeMatchedEvents(null);
        }
      } finally {
        setIsLoadingRangeCount(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [selectedStation, rangeStartDate, rangeEndDate]);

  return (
    <aside className={`station-side-panel ${selectedStation ? "open" : ""}`}>
      {selectedStation ? (
        <>
          <div className="station-side-panel-header">
            <h3>{getDisplayName(selectedStation)}</h3>
            <button
              type="button"
              className="station-side-close-btn"
              onClick={onClose}
            >
              Close
            </button>
          </div>
          <div className="station-side-panel-body">
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

            <hr className="station-side-divider" />

            {/* 修改备注: 单站点事件聚合摘要，按 station_id 查询 station_records */}
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
                    <div className="side-panel-date-row">
                      <input
                        className="side-panel-date-input"
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
                        className="side-panel-date-input"
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
          </div>
        </>
      ) : (
        <div className="station-side-panel-empty">
          Click a station name in popup to view details.
        </div>
      )}
    </aside>
  );
}
