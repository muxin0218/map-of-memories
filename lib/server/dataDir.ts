import path from "path";

export function getWritableDataDir() {
  return process.env.MAP_OF_US_DATA_DIR || path.join(process.cwd(), "data");
}
