import { index, pgTable, real, serial, text } from 'drizzle-orm/pg-core';

import { stations } from './stations';

export const stationRecords = pgTable(
  'station_records',
  {
    id: serial('id').primaryKey(),
    station_id: text('station_id').references(() => stations.station_id),
    start_time: text('start_time'),
    peak_time: text('peak_time'),
    end_time: text('end_time'),
    start_value: real('start_value'),
    peak_value: real('peak_value'),
    end_value: real('end_value'),
    rise_time: real('rise_time'),
    fall_time: real('fall_time'),
    peak_time_str: text('peak_time_str'),
  },
  (table) => [
    index('idx_records_peak_value').on(table.peak_value),
    index('idx_records_station_time').on(table.station_id, table.peak_time),
    index('idx_records_peak_time').on(table.peak_time),
  ],
);
