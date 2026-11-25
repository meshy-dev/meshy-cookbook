# Published sample previews

The three pictures show this recipe's app in Chrome on macOS on November 25, 2026, with the robot barista from a live run of the app on November 24: text-to-3d preview task `01a20bf5-1dea-72f1-a1e7-31f0c2d65e19`, refine task `01a20bf6-10a5-745d-a2f9-42a4479aa946`, rigging task `01a20bf6-a84f-71c4-8de2-a72fdedfb15c`, Idle animation task `01a20bf7-291f-77c1-b312-fb424b2ca425`, and the All Night Dance (`01a20bf9-143d-72b2-87c7-a83cba23a812`) and Big Wave Hello (`01a20bfd-5585-7281-9807-ce2e6a4d90ae`) animation tasks.

The run's GLB files were downloaded from those tasks and served to the app from its own development server, with the character saved in the browser as the app saves it. Everything else is the app as published here: the stage, lighting, finishes, tint, backdrops, skeleton view and panels. The pictures were captured in headless Chrome 158 at 1,440 × 900 pixels with the page's own controls, and network requests to `/api/meshy/tasks` were blocked during the capture so it could not create a task.

| Published asset | What the page shows | SHA-256 |
|---|---|---|
| `studio.png` | The character after loading: Idle clip, Hero camera, Original finish, no tint, Studio backdrop | `d02c955ff607517c341ce936d31067e4f677d4e0bd2e9b65c1b11bf032ba91f4` |
| `directed.png` | All Night Dance, about 4 seconds in, with the Metal finish, the Gold tint (`#f5c542`) and the Night backdrop | `4155048e1671741c7b47673a5cdcc8cc1aeb21e504c07eca0c3fcdf9e050a3b5` |
| `skeleton.png` | The Wire finish with Skeleton on, Front camera and Void backdrop, during Big Wave Hello | `aa5a5241abea0d594d79c029afec28a3c502e268912a80dee0c7a57e91055058` |

The chat bar reads "Add an AI Gateway key under API keys to direct by chat" because the capture ran without an AI Gateway key.

These are previews of one observed output. The model files are not part of the repository or a public download, and generation can produce different results.
