"use client";

// 修改备注: 增加 React hooks 以请求 stations API、管理搜索与地图交互状态
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Map as LeafletMapInstance } from "leaflet";
import { latLngBounds } from "leaflet";
import { MapContainer, TileLayer, ZoomControl } from "react-leaflet";
import type { Station, StationsApiResponse } from "../types/index";
import MapToolbar from "./components/MapToolbar";
import StationSidePanel from "./components/StationSidePanel";
import StationMarkers from "./components/StationMarkers";
import { MapInstanceWatcher, ZoomWatcher } from "./components/MapEventWatchers";
import {
  findBestGroupName,
  normalizeText,
  stationDisplayName,
} from "./mapUtils";
import styles from "./LeafletMap.module.css";

const center: [number, number] = [36.2048, 138.2529];
const japanBounds: [[number, number], [number, number]] = [
  [20.0, 122.0],
  [47.5, 154.0],
];

export default function LeafletMap() {
  //开始ui状态
  const [stations, setStations] = useState<Station[]>([]); // station-info data的接收
  const [isLoading, setIsLoading] = useState(true);
  // 记录当前地图缩放级别，初始与 MapContainer 的 zoom 一致
  const [zoom, setZoom] = useState(5);

  const [error, setError] = useState<string | null>(null);

  // 修改备注: 记录被点击的站点，用于右侧信息面板展示
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  // 修改备注: 记录被选中的 Basin 名称及其站点数量
  const [selectedBasin, setSelectedBasin] = useState<string | null>(null);
  const [basinStationCount, setBasinStationCount] = useState<number>(0);

  // 修改备注: 保存地图实例，用于搜索后自动跳转
  const [mapInstance, setMapInstance] = useState<LeafletMapInstance | null>(
    null,
  );
  // 修改备注: 搜索输入与提示文案
  const [searchText, setSearchText] = useState("");
  const [searchHint, setSearchHint] = useState<string>("");
  // 修改备注: 记录搜索命中的站点ID，用于地图高亮显示
  const [highlightedStationIds, setHighlightedStationIds] = useState<string[]>(
    [],
  );

  //REVIEW - 1. station info  data fetching
  useEffect(() => {
    //NOTE -  构造一个controller object 用于在意外 unmount 组件的时候(在fetch 过程中) 直接停止fetch 行为,防止内存泄露
    const controller = new AbortController();

    async function fetchAllStations() {
      try {
        setIsLoading(true);
        setError(null);

        let page = 1;
        let totalPages = 1;
        const merged: Station[] = [];

        while (page <= totalPages) {
          const res = await fetch(`/api/stations?page=${page}&pageSize=1000`, {
            signal: controller.signal,
          });

          if (!res.ok) {
            throw new Error(`Request failed with status ${res.status}`);
          }

          const data = (await res.json()) as StationsApiResponse;
          merged.push(...data.items);
          totalPages = data.pagination.totalPages || 1;
          page += 1;
        }
        setStations(merged);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Failed to load stations.");
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchAllStations();
    return () => controller.abort();
  }, []);

  // 基于 basin_name 聚合，供搜索优先匹配
  const basinGroups = useMemo(() => {
    const groups = new Map<string, Station[]>();
    stations.forEach((station) => {
      const name = station.basin_name?.trim();
      if (!name) {
        return;
      }
      const list = groups.get(name) ?? [];
      list.push(station);
      groups.set(name, list);
    });
    return groups;
  }, [stations]);

  // 修改备注: 打点半径随缩放指数增长，起始更小，放大后更明显
  const markerRadius = useMemo(() => {
    const radius = 1.2 * Math.pow(1.35, zoom - 4);
    return Math.min(10, Math.max(1.2, radius));
  }, [zoom]);

  // 修改备注: 输入时提供 basin_name 前缀联想
  const basinSuggestions = useMemo(() => {
    const keyword = normalizeText(searchText);
    if (!keyword) {
      return [];
    }
    return Array.from(basinGroups.keys())
      .filter((name) => normalizeText(name).startsWith(keyword))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 8);
  }, [basinGroups, searchText]);

  // 修改备注: 输入时提供 station_name 前缀联想
  const stationNameSuggestions = useMemo(() => {
    const keyword = normalizeText(searchText);
    if (!keyword) {
      return [];
    }

    const unique = new Set<string>();
    stations.forEach((station) => {
      const name = station.station_name?.trim();
      if (!name) {
        return;
      }
      if (normalizeText(name).startsWith(keyword)) {
        unique.add(name);
      }
    });

    return Array.from(unique)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 8);
  }, [stations, searchText]);

  // 修改备注: 合并 basin/station 联想，交给工具栏统一展示
  const searchSuggestions = useMemo(
    () => [
      ...basinSuggestions.map((value) => ({
        value,
        type: "basin name" as const,
      })),
      ...stationNameSuggestions.map((value) => ({
        value,
        type: "station name" as const,
      })),
    ],
    [basinSuggestions, stationNameSuggestions],
  );

  function zoomToStations(targetStations: Station[]) {
    if (!mapInstance || targetStations.length === 0) {
      return;
    }

    if (targetStations.length === 1) {
      const target = targetStations[0];
      mapInstance.flyTo(
        [target.latitude as number, target.longitude as number],
        11,
        {
          animate: true,
          duration: 1.0,
        },
      );
      return;
    }

    const bounds = latLngBounds(
      targetStations.map(
        (station) =>
          [station.latitude as number, station.longitude as number] as [
            number,
            number,
          ],
      ),
    );
    mapInstance.fitBounds(bounds.pad(0.15), {
      animate: true,
      duration: 1.0,
    });
  }

  // 修改备注: 搜索优先级为 basin_name -> river_name -> station_name/2/3
  function performSearch(rawKeyword: string) {
    const keyword = rawKeyword.trim();
    if (!keyword) {
      setHighlightedStationIds([]);
      setSearchHint("请输入 basin / station 名称");
      return false;
    }
    if (!mapInstance) {
      setHighlightedStationIds([]);
      setSearchHint("地图尚未就绪，请稍后重试");
      return false;
    }

    const basin = findBestGroupName(basinGroups, keyword);
    if (basin) {
      const matched = basinGroups.get(basin) ?? [];
      zoomToStations(matched);
      setSelectedStation(null);
      setSelectedBasin(basin);
      setBasinStationCount(matched.length);
      setHighlightedStationIds(matched.map((station) => station.station_id));
      setSearchHint(`已定位流域: ${basin}（${matched.length} 个站点）`);
      return true;
    }

    const normalizedKeyword = normalizeText(keyword);
    const stationMatch = stations.find((station) => {
      const candidates = [
        station.station_name,
        station.station_name2,
        station.station_name3,
      ]
        .map((name) => normalizeText(name))
        .filter(Boolean);
      return candidates.some(
        (name) =>
          name === normalizedKeyword || name.includes(normalizedKeyword),
      );
    });

    if (stationMatch) {
      zoomToStations([stationMatch]);
      setSelectedStation(stationMatch);
      setHighlightedStationIds([stationMatch.station_id]);
      setSearchHint(`已定位站点: ${stationDisplayName(stationMatch)}`);
      return true;
    }

    setHighlightedStationIds([]);
    setSearchHint("未匹配到结果，请尝试更完整的名称");
    return false;
  }

  // 修改备注: 回车提交搜索
  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    performSearch(searchText);
  }

  // 修改备注: 点击联想词后自动填充并执行搜索
  function handleSuggestionSelect(value: string) {
    setSearchText(value);
    performSearch(value);
  }

  return (
    <div className={styles.mapShell}>
      <MapToolbar
        isLoading={isLoading}
        error={error}
        searchText={searchText}
        searchHint={searchHint}
        suggestions={searchSuggestions}
        onSearchTextChange={setSearchText}
        onSubmit={handleSearchSubmit}
        onSuggestionSelect={handleSuggestionSelect}
      />
      <MapContainer
        center={center}
        zoom={5}
        zoomControl={false}
        minZoom={4}
        maxZoom={12}
        maxBounds={japanBounds}
        maxBoundsViscosity={1}
        scrollWheelZoom
        className={styles.leafletCanvas}
        attributionControl
      >
        {/* 修改备注: 监听缩放变化用于驱动 marker 半径变化 */}
        <ZoomWatcher onZoomChange={setZoom} />
        {/* 修改备注: 传出地图实例，支持搜索后自动跳转 */}
        <MapInstanceWatcher onMapReady={setMapInstance} />
        <ZoomControl position="bottomright" />

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          noWrap
        />

        <StationMarkers
          stations={stations}
          markerRadius={markerRadius}
          highlightedStationIds={highlightedStationIds}
          onSelect={setSelectedStation}
          onHighlight={(stationId) => {
            if (stationId) {
              setHighlightedStationIds((prev) =>
                prev.includes(stationId) ? prev : [...prev, stationId],
              );
            } else {
              if (selectedBasin) {
                const basinStations = basinGroups.get(selectedBasin) ?? [];
                setHighlightedStationIds(
                  basinStations.map((station) => station.station_id),
                );
              } else {
                setHighlightedStationIds([]);
              }
            }
          }}
          getDisplayName={stationDisplayName}
        />
      </MapContainer>
      <StationSidePanel
        selectedStation={selectedStation}
        selectedBasin={selectedBasin}
        basinStationCount={basinStationCount}
        onCloseStation={() => {
          setSelectedStation(null);
          mapInstance?.closePopup();
        }}
        onCloseBasin={() => {
          setSelectedStation(null);
          setSelectedBasin(null);
          setHighlightedStationIds([]);
          mapInstance?.closePopup();
        }}
        getDisplayName={stationDisplayName}
      />
    </div>
  );
}
