"use client";

import { CircleMarker, Popup } from "react-leaflet";
import type { Station } from "../../types/index";
import styles from "./StationMarkers.module.css";

type StationMarkersProps = {
  stations: Station[];
  markerRadius: number;
  highlightedStationIds: string[];
  onSelect: (station: Station) => void;
  onHighlight: (stationId: string | null) => void;
  getDisplayName: (station: Station) => string;
};

export default function StationMarkers({
  stations,
  markerRadius,
  highlightedStationIds,
  onSelect,
  onHighlight,
  getDisplayName,
}: StationMarkersProps) {
  // 修改备注: 将高亮ID转为集合，快速判断当前点是否为搜索命中点
  const highlightedSet = new Set(highlightedStationIds);

  return (
    <>
      {stations.map((station) => {
        const isHighlighted = highlightedSet.has(station.station_id);

        return (
          <CircleMarker
            key={station.station_id}
            center={[station.latitude as number, station.longitude as number]}
            radius={markerRadius}
            pathOptions={{
              fillColor:
                station.has_data === 1
                  ? isHighlighted
                    ? "#F85552"
                    : "#3A94C5"
                  : "#BEC5B2",
              stroke: false,
              // 修改备注: 搜索命中点提高不透明度，增强可见性
              fillOpacity: isHighlighted ? 1 : 0.4,
            }}
            eventHandlers={{
              popupopen: () => onHighlight(station.station_id),
              popupclose: () => onHighlight(null),
            }}
          >
            <Popup>
              <div>
                <div>
                  <button
                    type="button"
                    className={styles.popupNameBtn}
                    onClick={() => onSelect(station)}
                  >
                    {getDisplayName(station)}
                  </button>
                </div>
                <div>ID: {station.station_id}</div>
                <div>Basin: {station.basin_name || "-"}</div>
                <div>Has data: {station.has_data === 1 ? "Yes" : "No"}</div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
