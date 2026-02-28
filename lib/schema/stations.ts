import { index, integer, pgTable, real, text } from 'drizzle-orm/pg-core';

export const stations = pgTable(
  'stations',
  {
    station_id: text('station_id').primaryKey(),
    latitude: real('latitude'),
    longitude: real('longitude'),
    basin_name: text('basin_name'),
    river_name: text('river_name'),
    station_name: text('station_name'),
    station_name2: text('station_name2'),
    station_name3: text('station_name3'),
    description: text('description'),
    has_data: integer('has_data').default(0),
  },
  (table) => [
    index('idx_stations_has_data').on(table.has_data),
    index('idx_stations_basin').on(table.basin_name),
    index('idx_stations_river').on(table.river_name),
  ],
);
