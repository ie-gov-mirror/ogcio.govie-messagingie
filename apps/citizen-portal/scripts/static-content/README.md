# Static content: LifeEvent discovery

Fetches the discovery content from the gov.ie Wagtail CMS, validates it and
writes the normalised model that `next build` reads. See the ADR
"LifeEvent discovery: build-time content from the gov.ie CMS"
(`docs/wiki/ADRs/`) for the decisions behind it.

```bash
pnpm fetch:static-content   # mock mode → .static-content/
```

`pnpm dev` and `pnpm build` run it first. With `NEXT_PUBLIC_ENABLE_LEA` off it
does nothing and exits `0`, since the discovery routes aren't built.

| Variable | Default | |
| :-- | :-- | :-- |
| `STATIC_CONTENT_MODE` | `mock` | the only mode for now; Infomed lands in M2 (AB#43550) |
| `STATIC_CONTENT_DIR` | `apps/citizen-portal/.static-content` | output directory (gitignored) |

Any content error prints the document, JSON path and rule, writes nothing
and exits `1`, which fails the build.

## Output

- `manifest.json`: schema version, mode, generation time.
- `discovery.en.json`, `discovery.ga.json`: the list page, categories, life
  events and journeys for one locale.

The shape is `src/lib/discovery/content-model.ts`. Pages read it with
`getDiscovery` from `@/lib/discovery`, which validates it against that
schema, and never see Wagtail's format.

## Layout

- `fetch.ts`: entry point. Runs under Node's type stripping, so imports are
  relative with `.ts` extensions and only erasable TypeScript is allowed.
- `wagtail/`: the Wagtail API v2 client (R1–R4, paging), raw response
  schemas, and the transports. Mock and proxy mode differ only in the
  transport.
- `pipeline/`: discover the EN tree → pair GA pages → validate → structure
  rules → rich text and links → map.
- `fixtures/mock/pages/<locale>/<id>.json`: one Wagtail detail response per
  page. A GA page shares its EN page's ID, and `translation_of=<id>&locale=ga`
  returns it. Listings return pages in ID order, standing in for tree order.
  Page types are placeholders until Carbon names them (ADR OQ2); see
  `PAGE_TYPES` in `config.ts`.
