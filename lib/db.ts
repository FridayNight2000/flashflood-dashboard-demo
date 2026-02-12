import Database from "better-sqlite3";
import path from "path";

// Build an absolute path to the shared DB file at the repo root.
const dbPath = path.join(process.cwd(), "..", "hydrology_data.db");
// process.cwd() 在 Next dev 时通常是 web/ 目录，所以用 .. 回到仓库根

export const db = new Database(dbPath, {
  readonly: true,
  fileMustExist: true,
});
