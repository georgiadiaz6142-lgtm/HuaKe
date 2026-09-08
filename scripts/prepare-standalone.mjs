import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const standaloneRoot = join(projectRoot, ".next", "standalone");
const standaloneStaticRoot = join(standaloneRoot, ".next", "static");
const standalonePublicRoot = join(standaloneRoot, "public");

await rm(standaloneStaticRoot, { recursive: true, force: true });
await rm(standalonePublicRoot, { recursive: true, force: true });
await mkdir(join(standaloneRoot, ".next"), { recursive: true });
await cp(join(projectRoot, ".next", "static"), standaloneStaticRoot, {
  recursive: true,
});
await cp(join(projectRoot, "public"), standalonePublicRoot, {
  recursive: true,
  filter: (source) => !source.endsWith(".png"),
});
await rm(join(standaloneRoot, "node_modules", "@img"), {
  recursive: true,
  force: true,
});
await rm(join(standaloneRoot, "node_modules", "sharp"), {
  recursive: true,
  force: true,
});

console.log(`Standalone runtime prepared at ${standaloneRoot}`);
