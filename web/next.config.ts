import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Pin the project root to web/. Without it Next infers the root from the nearest lockfile above, and a stray
  // package-lock.json higher up (e.g. in a home folder) makes the dev server watch that whole tree: the Python
  // workers' log files then trigger rebuilds and reload the page every few seconds.
  turbopack: { root: path.resolve(__dirname) },
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
