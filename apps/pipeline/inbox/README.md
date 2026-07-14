# inbox/ — source page images

The harvested page images the pipeline reads (SLICE-01 step 1 — "the four pages are already in
`inbox/`"; no IIIF fetch in this slice). `src/config.ts` defaults `INBOX_DIR` to this folder.

## Expected files (Brooklyn News, Feb 1 1924 — CDM collection `p16014coll5`)

| File | CDM record | Page |
|---|---|---|
| `p16014coll5_7618_full.jpg` | 7618 | 1 (news front page) |
| `p16014coll5_7619_full.jpg` | 7619 | 2 |
| `p16014coll5_7620_full.jpg` | 7620 | 3 |
| `p16014coll5_7621_full.jpg` | 7621 | 4 |

Public domain (NoC-US), Old Brooklyn Historical Society provenance. ~5332×6845 px each.

## Notes

- **The image files are gitignored** (`inbox/*.jpg`) — they are not committed. Obtain them from the
  ContentDM collection `p16014coll5` (records 7618–7621) or the project vault, and drop them here.
- The **`fixture` provider does not need these images** — it replays the committed transcriptions in
  `fixtures/`, so `npm run slice01` works without them. The images are required only for **live**
  providers (`gemini` / `anthropic` / `openai`) and `npm run probe`.
- To keep the images somewhere else, point the pipeline at them:
  `INBOX_DIR=/path/to/images npm run probe`.
- The page → record → filename map is defined in `src/config.ts` (`PAGES`).
