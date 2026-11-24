# Published sample previews

The three pictures show this recipe's app in Chrome on macOS on November 24, 2026, with the robot barista from a live run of the app the same day: text-to-3d preview task `01a20bf5-1dea-72f1-a1e7-31f0c2d65e19`, refine task `01a20bf6-10a5-745d-a2f9-42a4479aa946`, rigging task `01a20bf6-a84f-71c4-8de2-a72fdedfb15c`, Idle animation task `01a20bf7-291f-77c1-b312-fb424b2ca425`, and the All Night Dance (`01a20bf9-143d-72b2-87c7-a83cba23a812`) and Big Wave Hello (`01a20bfd-5585-7281-9807-ce2e6a4d90ae`) animation tasks.

The run's GLB files were downloaded from those tasks and served to the app from its own development server, with the character saved in the browser as the app saves it. Everything else is the app as published here: the stage, lighting, finishes, tint, backdrops, skeleton view and panels. The pictures were captured in headless Chrome 158 at 1,440 × 900 pixels with the page's own controls, and network requests to `/api/meshy/tasks` were blocked during the capture so it could not create a task.

| Published asset | What the page shows | SHA-256 |
|---|---|---|
| `studio.png` | The character after loading: Idle clip, Hero camera, Original finish, no tint, Studio backdrop | `4e3d62d6e98a9c0560c6614b0362f74c0b6b3a59d501a4a880ce351103255ce4` |
| `directed.png` | All Night Dance, about 4 seconds in, with the Metal finish, the Gold tint (`#f5c542`) and the Night backdrop | `43814215793a71c689354c9035e95501f1ff878dc610c4bf0986c9b14dbdfecd` |
| `skeleton.png` | The Wire finish with Skeleton on, Front camera and Void backdrop, during Big Wave Hello | `d38b5de363fa23a9d3e95ed55fbe0053a73a5c56e055fe308ac0a72a876d66fa` |

The chat bar reads "Add an AI Gateway key under API keys to direct by chat" because the capture ran without an AI Gateway key.

These are previews of one observed output. The model files are not part of the repository or a public download, and generation can produce different results.
