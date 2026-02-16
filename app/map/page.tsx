"use client";

import dynamic from "next/dynamic";
import styles from "./page.module.css";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <p>Loading map...</p>,
});

export default function MapPage() {
  return (
    <main className={styles.map}>
      <LeafletMap />
    </main>
  );
}
