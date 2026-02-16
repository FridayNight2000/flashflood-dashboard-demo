const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(process.cwd(), "../hydrology_data.db");
const db = new Database(dbPath, { readonly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all();
console.log("Tables:", tables);

tables.forEach((t) => {
  const pragma = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`\nSchema for ${t.name}:`, pragma);
});
