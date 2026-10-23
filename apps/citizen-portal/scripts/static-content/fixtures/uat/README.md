# UAT pages

Responses recorded from the UAT CMS
(`https://api.integration.uat.beta.gov.ie`, landing page 207788) on
2026-10-19: one `GET /v2/pages/<id>/` response per page in `<locale>/<id>.json`,
unedited, except that each GA page names its EN page in `_translation_of`,
as in the mock fixtures. That's the EN and GA landing pages and 17 life
events in each locale.

One edit by hand: on 2026-10-19 no UAT service linked to a CMS page, so the
build would generate no `/discovery/<life-event>/<service>` page, and
`output: "export"` fails a dynamic route with none. So the
child-starting-school service that linked to page 195047 is copied back
into `en/208319.json` and `ga/208320.json`, with `en/195047.json` itself,
all as recorded on 2026-10-16. Page 195047 has no GA translation, so both
locales use it. A build reading UAT directly fails the same way until a
service links to a CMS page again.

## Re-recording

On the VPN, with the proxy-mode variables set (see `../../README.md`):

```bash
pnpm record:static-content-uat
```

It replaces `pages/` with what the pipeline requests from UAT, landing page
207788: the landing page, its life events, the CMS pages their services link
to, and the GA translation of each. That drops any edit by hand, so it warns
when no service links to a page with a body: patch one in again as above,
or `next build` fails. Then update the date and notes here.

## Lifetime

A stopgap: mock mode (`pnpm dev`, and `pnpm build` without proxy settings)
serves them until UAT is flagged as stable. Then resolve the `TODO`s in
`config.ts`, `fetch.ts` and `test/static-content/write.test.ts`, delete
`record-uat-fixtures.ts` and its `record:static-content-uat` script in
`package.json`, and delete this directory.
