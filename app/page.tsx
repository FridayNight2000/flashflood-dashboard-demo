import Link from "next/link";
export default function Home() {
  return (
    <main className="hero">
      <h1>
        <span>Flashflood Database</span> in JAPAN
      </h1>
      <button>
        <Link href="/map">Explore</Link>
      </button>
    </main>
  );
}
