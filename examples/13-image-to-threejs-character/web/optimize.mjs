// Shrink the animated character for the web: WebP textures at 1024 px, and meshopt-compressed geometry and clips.

import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const DIRECTORY = import.meta.dirname;
const DOWNLOADS = [
  join(DIRECTORY, "../python/output/animated-character.glb"),
  join(DIRECTORY, "../typescript/output/animated-character.glb"),
];
const OUTPUT = join(DIRECTORY, "public/models/character.glb");

if (process.argv.length > 3) throw new Error("Usage: npm run optimize -- [animated-character.glb]");
let input = process.argv[2];
if (input === undefined) {
  // The newest file either language's main downloaded.
  const found = [];
  for (const path of DOWNLOADS) {
    try {
      found.push({ path, modified: (await stat(path)).mtimeMs });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (found.length === 0) throw new Error("No animated-character.glb yet. Run python/main.py or typescript/main.ts first, or pass the GLB to shrink.");
  input = found.sort((a, b) => b.modified - a.modified)[0].path;
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const document = await io.read(input);
document.setLogger(new Logger(Logger.Verbosity.WARN));
await document.transform(
  dedup(), // merge identical accessors, textures and materials
  prune(), // drop anything nothing in the scene uses
  resample(), // drop animation keyframes that the frames around them already describe
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024] }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await mkdir(dirname(OUTPUT), { recursive: true });
await io.write(OUTPUT, document);

const megabytes = async (path) => ((await stat(path)).size / 1e6).toFixed(1);
console.log(`Done: ${OUTPUT}  (${await megabytes(input)} MB -> ${await megabytes(OUTPUT)} MB)`);
