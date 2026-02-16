import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.hero}>
      <h1>
        <span>Flashflood Database</span> in JAPAN
      </h1>
      <button>
        <Link href="/map">Explore</Link>
      </button>
    </main>
  );
}
