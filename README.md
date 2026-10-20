# episode-viewer

Read-only web player of an annotated robotics episode: video plus switchable layers (masks, hand poses, depth,
interactions, actions, 3D scene). A static site, independent of the cvat-sam repository.

- `site/` – the site itself (`index.html`, `viewer.css`, `viewer.js`) and its data (`data.json.gz`, `masks.json.gz`,
  `depth.bin.gz`, `cloud.bin.gz`, `video.mp4`)
- `serve.py` – static server with HTTP Range support (needed for seeking in the video)
- `export.ps1` – pulls fresh data from a running CVAT (`docker exec cvat_server … export_viewer`) into `site/`;
  the only step that needs CVAT
- `start.ps1` – serves `site/` on http://localhost:8099/; `-Tunnel` also opens a public cloudflared link

```powershell
.\export.ps1          # only when the annotation changed
.\start.ps1 -Tunnel
```

The public link is open to anyone who has it, changes at every tunnel start, and the PC has to stay on.
Deep links: `#t=<seconds>&layers=masks,hand2d,interactions&tab=scene`.
