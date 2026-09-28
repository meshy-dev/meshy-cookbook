// Turn a low-poly concept image into a low-poly GLB in seconds.

import { join } from "node:path";
import { Meshy } from "../../../shared/typescript/meshy.js";

const DIRECTORY = import.meta.dirname;
const SAMPLE = join(DIRECTORY, "../input/low-poly-oak.png");
const INPUT = process.argv[2] ?? SAMPLE;
const POLYCOUNT = process.argv[3] ? Number(process.argv[3]) : 1000;
const OUTPUT = join(DIRECTORY, "output");

if (process.argv.length > 4) throw new Error("Usage: npm start -- [image.png] [face_count]");
if ((process.argv[3] !== undefined && !/^[0-9]+$/.test(process.argv[3])) || !Number.isInteger(POLYCOUNT) || POLYCOUNT < 100 || POLYCOUNT > 15000) {
  throw new Error("Face count must be an integer from 100 to 15000");
}
const imageUrl = await Meshy.dataUri(INPUT); // validate the input before opening a client
const client = new Meshy(); // reads MESHY_API_KEY from .env
const taskId = await client.create("image-to-3d", {
  image_url: imageUrl,
  model_type: "smart-topology",
  target_polycount: POLYCOUNT,
  should_texture: false,
  target_formats: ["glb"],
});
const task = await client.wait("image-to-3d", taskId);
await client.download(task.model_urls.glb, join(OUTPUT, "low-poly-prop.glb"));
await client.download(task.thumbnail_url, join(OUTPUT, "low-poly-prop-thumbnail.png"));
console.log(`Done: ${join(OUTPUT, "low-poly-prop.glb")}  (${task.consumed_credits} credits)`);
