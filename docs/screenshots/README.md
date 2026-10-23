# Screenshots

These PNGs are shown in the main [`../../README.md`](../../README.md). Captured from the running
app and downscaled to 1600px wide to keep the repo light.

| File | Screen |
| --- | --- |
| `welcome.png` | Login / sign-up gate |
| `evidence.png` | Case — evidence register (files hashed on import) |
| `risk.png` | Risk tab — composite score, "why", recommendations |
| `export.png` | The single Export menu (PDF / CSV / JSON) |
| `help.png` | In-app help / field guide |
| `tour.png` | First-run guided tour |
| `account.png` | Account menu (edit profile, replay tour, reset, log out) |
| `reset.png` | Reset entire app (type-to-confirm) |

To refresh one, re-capture from the app (`npm run electron:dev`) with the same filename
(macOS: **Cmd+Shift+4 → Space** captures a single window), then downscale:
`sips --resampleWidth 1600 name.png`.
