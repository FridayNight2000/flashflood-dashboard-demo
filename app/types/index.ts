export type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

// 修改备注: 定义站点类型，对应 /api/stations 的返回字段
export type Station = {
  station_id: string;
  latitude: number | null;
  longitude: number | null;
  basin_name: string | null;
  river_name: string | null;
  station_name: string | null;
  station_name2?: string | null;
  station_name3?: string | null;
  description?: string | null;
  has_data: number;
};

// 修改备注: 定义 API 响应类型，用于分页拉取全部站点
export type StationsApiResponse = {
  items: Station[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

// 修改备注: 单站点事件聚合摘要（side-panel 使用）
export type StationEventSummary = {
  totalEvents: number;
  matchedEvents: number;
  firstStartTime: string | null;
  lastEndTime: string | null;
  minPeakTime: string | null;
  maxPeakTime: string | null;
  maxPeakValue: number | null;
  avgPeakValue: number | null;
  avgRiseTime: number | null;
  avgFallTime: number | null;
};

// 修改备注: 单站点最近事件（side-panel 使用）
export type StationRecentEvent = {
  id: number;
  start_time: string | null;
  peak_time: string | null;
  end_time: string | null;
  start_value: number | null;
  peak_value: number | null;
  end_value: number | null;
  rise_time: number | null;
  fall_time: number | null;
  peak_time_str: string | null;
};

// 修改备注: 单站点事件聚合 API 返回类型
export type StationEventsApiResponse = {
  stationId: string;
  summary: StationEventSummary;
  recentEvents: StationRecentEvent[];
};

// 修改备注: 时间段筛选时的轻量计数响应
export type StationEventsCountResponse = {
  stationId: string;
  matchedEvents: number;
};
