"use client";

import type { FormEvent } from "react";
import styles from "./MapToolbar.module.css";

type SearchSuggestion = {
  value: string;
  type: "basin name" | "station name";
};

type MapToolbarProps = {
  isLoading: boolean;
  error: string | null;
  searchText: string;
  searchHint: string;
  suggestions: SearchSuggestion[];
  onSearchTextChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSuggestionSelect: (value: string) => void;
};

export default function MapToolbar({
  isLoading,
  error,
  searchText,
  searchHint,
  suggestions,
  onSearchTextChange,
  onSubmit,
  onSuggestionSelect,
}: MapToolbarProps) {
  const placeholder = isLoading
    ? "Loading stations..."
    : error
      ? "Stations unavailable"
      : "Search by basin / station";

  return (
    <div className={styles.mapToolbar}>
      <form onSubmit={onSubmit}>
        <input
          className={styles.mapInput}
          type="text"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder={placeholder}
        />
      </form>
      {/* 修改备注: 搜索联想列表，展示 basin_name + station_name 前缀匹配项 */}
      {suggestions.length > 0 && (
        <ul className={styles.mapSuggestions}>
          {suggestions.map((item) => (
            <li key={`${item.type}-${item.value}`}>
              <button
                type="button"
                className={styles.mapSuggestionBtn}
                onClick={() => onSuggestionSelect(item.value)}
              >
                <span>{item.value}</span>
                <span className={styles.mapSuggestionType}>{item.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchHint && <p className={styles.mapSearchHint}>{searchHint}</p>}
    </div>
  );
}
