# Screenshots

Shown in the main [`../../README.md`](../../README.md). Captured from the running app
("Noir Lab" UI) and downscaled to 1600px wide to keep the repo light.

| File | Screen |
| --- | --- |
| `launch.png` | The launch / boot console (hero) |
| `welcome.png` | Login / sign-up gate |
| `home.png` | Home — combined dashboard across all cases |
| `case.png` | Case detail — stat tiles, tabs & insight card |
| `risk.png` | Composite risk score, "why" & recommendations |
| `evidence.png` | Evidence register (SHA-256/MD5 hashed) |
| `help.png` | In-app help / field guide |
| `tour.png` | First-run guided tour |
| `reset.png` | Reset entire app (type-to-confirm) |

To refresh one, re-capture from the app (`npm run electron:dev`) with the same filename
(macOS: **Cmd+Shift+4 → Space** captures a single window), then downscale:
`sips --resampleWidth 1600 name.png`.
