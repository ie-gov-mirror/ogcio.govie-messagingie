# Upload API k6 load tests

Copy `k6/.env.sample` to `k6/.env` and fill in the Logto credentials before running the load tests.

The default command runs the two phases in order:

```sh
pnpm --filter upload-api test:nf
```

Use the validation command to confirm env loading, file resolution, and `k6` availability without sending requests:

```sh
pnpm --filter upload-api test:nf:validate
```

The runner supports a phase override through `UPLOAD_API_K6_PHASE`:

```sh
UPLOAD_API_K6_PHASE=upload pnpm --filter upload-api test:nf
UPLOAD_API_K6_PHASE=download pnpm --filter upload-api test:nf
```

Artifacts are written to `k6/artifacts` by default:

```text
upload-summary.json
download-summary.json
organization-files-before.json
organization-files-after.json
uploaded-file-ids.json
shared-file-ids.json
results.md
run-manifest.json
```

The upload phase measures only `POST /api/v1/files`. After that phase finishes, the runner snapshots metadata, shares the new file IDs through `POST /api/v1/permissions`, and then reuses those IDs in the download phase.

The download phase measures only `GET /api/v1/files/{id}` with the impersonated citizen token.
