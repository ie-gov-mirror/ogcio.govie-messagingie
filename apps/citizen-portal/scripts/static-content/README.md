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

| Variable                       | Default                               |                                                                                                   |
| :----------------------------- | :------------------------------------ | :------------------------------------------------------------------------------------------------ |
| `STATIC_CONTENT_MODE`          | `mock`                                | `mock` reads recorded fixtures (`fixtures/uat` for now); `proxy` calls the gov.ie Integration API |
| `STATIC_CONTENT_DIR`           | `apps/citizen-portal/.static-content` | output directory (gitignored)                                                                     |
| `STATIC_CONTENT_API_URL`       |                                       | proxy only: the API's https base URL, e.g. `https://api.integration.uat.beta.gov.ie`              |
| `STATIC_CONTENT_CLIENT_ID`     |                                       | proxy only: OAuth2 client with the `read` scope                                                   |
| `STATIC_CONTENT_CLIENT_SECRET` |                                       | proxy only: that client's secret                                                                  |
| `STATIC_CONTENT_INDEX_PAGE_ID` |                                       | proxy only: the ID of the life events landing page                                                |

Proxy mode gets a token from `<STATIC_CONTENT_API_URL>/o/token/` with the
OAuth2 client credentials grant, reuses it until shortly before it expires,
and fetches a new one once if the API answers 401. The API's spec is
`wagtail/openapi.yaml`, from `https://api.integration.uat.beta.gov.ie/schema`.

Any content error prints the document, JSON path and rule, writes nothing
and exits `1`, which fails the build.

## Output

- `manifest.json`: schema version, mode, generation time.
- `discovery.en.json`, `discovery.ga.json`: the list page, categories and
  life events, each with its services and guidance, for one locale.

The shape is `src/lib/discovery/content-model.ts`. Pages read it with
`getDiscovery` from `@/lib/discovery`, which validates it against that
schema, and never see Wagtail's format.

## Layout

- `fetch.ts`: entry point. Runs under Node's type stripping, so imports are
  relative with `.ts` extensions and only erasable TypeScript is allowed.
- `wagtail/`: the Wagtail API v2 client, raw response schemas, and the
  transports. Mock and proxy mode differ only in the transport:
  `mock-transport.ts` serves the fixtures, `http-transport.ts` calls the API
  with a token from `oauth.ts`.
- `pipeline/`: fetch the EN landing page and its life events → pair each
  with its GA page (`translation_of`) → validate → structure rules → rich
  text and links → map.
- `fixtures/uat/`: real responses recorded from UAT. Mock mode serves
  these until UAT is flagged as stable; see its README.
- `fixtures/mock/`: hand-made pages covering the edge cases the pipeline
  tests rely on. Mock mode switches back to them later (the `TODO`s in
  `config.ts`, `fetch.ts` and `write.test.ts`).

## Requests

1. `GET /v2/pages/<STATIC_CONTENT_INDEX_PAGE_ID>/`: the EN landing page.
2. `GET /v2/pages/?child_of=<id>&type=life_events.LifeEventPage&locale=en&fields=*`:
   its life events, 20 at a time.
3. `GET /v2/pages/?translation_of=<id>&locale=ga&type=<type>&fields=*`: the
   GA page of the landing page and each life event. The spec doesn't list
   `translation_of`, but the API supports it.

A GA page that is still an alias of its EN page (Wagtail's untranslated
state) builds from the EN content, with a warning. A link with no text
shows the title of the discovery page it points to or, for any other
link, its URL, with a warning.
