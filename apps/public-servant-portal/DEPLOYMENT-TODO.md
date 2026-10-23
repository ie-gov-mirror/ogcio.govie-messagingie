# public-servant-portal — deployment TODO

This app is now wired into the repo-side pipelines (`.azure/pipeline-public-servant-portal.yml`,
release-please, nightly, sonar, root scripts). It still has **no Kubernetes manifests**, so the
GitOps stage of the pipeline will fail until the work below is done in
[`ogcio/messaging-k8s-apps`](https://github.com/ogcio/messaging-k8s-apps) (a separate repo — nothing
in this PR touches it).

Facts the build pipeline already commits to (do not change on the k8s side without changing the
pipeline too):

| Thing                        | Value                                                                                                                             | Source                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Image name                   | `bb-messaging-public-servant-portal`                                                                                              | `.azure/pipeline-public-servant-portal.yml` (`services[].imageName`)                                                                       |
| ECR registry                 | `428528001781.dkr.ecr.eu-west-1.amazonaws.com`                                                                                    | `.azure/pipeline-variables/*.yml` (`ecrEndpoint`)                                                                                          |
| Overlays path                | `public-servant-portal/overlays/$(clusterName)/$(overlaysDirectory)` → `…/non-prod-02/dev`, `…/non-prod-02/uat`, `…/prod-02/prod` | `services[].overlaysPath`                                                                                                                  |
| Container port               | `8080` (nginx, unprivileged)                                                                                                      | `apps/public-servant-portal/Dockerfile` (`PORT` default)                                                                                   |
| Release tag (prod image tag) | `public-servant-portal-v<version>`                                                                                                | `release-please/public-servant-portal.config.json`                                                                                         |
| Served hostnames             | `messaging-admin.<env>.services.gov.ie` **and** `profile-admin.<env>.services.gov.ie`                                             | `MESSAGING_ADMIN_HOST` / `PROFILE_ADMIN_HOST` build args (`publicServantPortalMessagingAdminHost` / `publicServantPortalProfileAdminHost`) |

## 1. New `public-servant-portal/base/` (copy `citizen-portal/base/`, not `admin-next/base/`)

`citizen-portal` is the right template: both are static Next.js exports served by
`nginx-unprivileged` on 8080 with Host-based routing. `admin-next` is a Node server on 3022 with
HTTP `/api/health` probes — its probe and port conventions do **not** apply here.

Create:
- `base/deployment.yaml` — name `public-servant-portal`, container `public-servant-portal`,
  `image: public-servant-portal` (placeholder replaced by the overlay `images:` entry),
  `containerPort: 8080` named `http`, `envFrom` configMap `public-servant-portal`,
  istio-proxy sidecar block, `/tmp` `emptyDir` (256Mi) volume mount,
  `readOnlyRootFilesystem: true`, requests 128Mi/50m, limits 256Mi/200m.
  **Probes must be `tcpSocket: 8080`, not `httpGet`** — nginx in this image only answers Host
  headers matching `MESSAGING_ADMIN_HOST`/`PROFILE_ADMIN_HOST`; kubelet sends `Host: <pod-ip>` and
  gets a 444. Same reasoning as the comment in `citizen-portal/base/deployment.yaml`.
- `base/service.yaml` — port 8080 → targetPort 8080, name `http`.
- `base/peerauthentication.yaml` — selector `app.kubernetes.io/name: public-servant-portal`, mTLS `STRICT`.
- `base/serviceentry.yaml` — name `ext-svc-public-servant-portal`, host `public-servant-portal`, HTTPS/443, `MESH_EXTERNAL`, `DNS`.
- `base/kustomization.yaml` — the four resources above, labels
  `app.kubernetes.io/name: public-servant-portal`, `component: web` (citizen-portal uses `web`;
  admin-next uses `admin-next` — pick one and keep it identical in every overlay label block and in
  the `scaledobject-values.yaml`), `part-of: messaging`, `managed-by: argocd`;
  `configMapGenerator` name `public-servant-portal` with literals
  `NODE_ENV="production"`, `LOG_LEVEL="info"`, `ANALYTICS_ORGANIZATION_ID="ogcio"`.

## 2. Overlays

Three overlays, mirroring `citizen-portal/overlays/`:

| Overlay dir                                      | Namespace                              | Image tag                                                |
| ------------------------------------------------ | -------------------------------------- | -------------------------------------------------------- |
| `public-servant-portal/overlays/non-prod-02/dev` | `messaging-public-servant-portal-dev`  | build-id sentinel, rewritten by the pipeline GitOps step |
| `public-servant-portal/overlays/non-prod-02/uat` | `messaging-public-servant-portal-uat`  | build-id sentinel, rewritten by the pipeline GitOps step |
| `public-servant-portal/overlays/prod-02/prod`    | `messaging-public-servant-portal-prod` | `public-servant-portal-v0.1.0` (release tag)             |

Each overlay needs:
- `kustomization.yaml` with:
  - `namespace:` from the table, `resources: [../../../base]`
  - label block: `instance: public-servant-portal-<env>` plus the base label pairs
  - `images: [{ name: public-servant-portal, newName: 428528001781.dkr.ecr.eu-west-1.amazonaws.com/bb-messaging-public-servant-portal, newTag: <see table> }]`
  - `configMapGenerator: [{ name: public-servant-portal, behavior: merge, envs: [public-servant-portal-config-map.env] }]`
  - `helmCharts: [{ name: keda-scaled-objects, releaseName: public-servant-portal, repo: oci://428528001781.dkr.ecr.eu-west-1.amazonaws.com/charts, valuesFile: scaledobject-values.yaml, version: 1.0.3 }]`
- `public-servant-portal-config-map.env`:
  - dev/uat: `NODE_ENV=production`, `PORT=8080`
  - prod: the above plus `OTEL_ENABLE=true`, `OTEL_SERVICE_NAME=public-servant-portal`,
    `OTEL_COLLECTOR_URL=http://alloy-o11y-forwarder-cluster.messaging-o11y-prod.svc.cluster.local:4317`
    (dev/uat get the collector URL baked in at build time via the `otelCollectorUrl` pipeline variable)
- `scaledobject-values.yaml`: `scaledObject.name: public-servant-portal`,
  `namespace: <table>`, `pollingInterval: 30`, `cooldownPeriod: 60`,
  `scalingModifiers.metricType: Value`, `businessHoursCron.enabled: true`.

Namespaces must exist / be added to whatever creates them (ArgoCD AppProject + namespace bootstrap
— **not verified in this pass**, check how `messaging-citizen-portal-dev` was created before
assuming kustomize will make it).

## 3. Ingress / routing (two hostnames, two repos)

The image serves both admin zones from one nginx server block and 301s off-zone paths to their
owner. Istio must therefore forward **both** hostnames to this service and preserve the original
`Host` header (default istio behaviour — do not add a `rewrite.authority`).

### 3a. `messaging-admin.<env>.services.gov.ie` (this repo's k8s repo)

Gateway + cert already exist and stay as they are:
`istio/admin-next/base/{gateway,certificate}.yaml` patched per env in
`istio/admin-next/overlays/non-prod-02/{dev,uat}/kustomization.yaml` →
gateway `istio-system/messaging-admin-next-<env>`, cert `messaging-admin-next-<env>-cert`.

Recommended (matches how citizen-portal was introduced in `next/overlays/*/virtual-service.yaml`):
add an opt-in canary clause **above** the default route in
`admin-next/overlays/non-prod-02/{dev,uat}/virtual-service.yaml`:

```yaml
- match:
    - port: 443
      headers:
        x-canary:
          exact: "public-servant-portal"
  route:
    - destination:
        host: public-servant-portal.messaging-public-servant-portal-<env>.svc.cluster.local
        port:
          number: 8080
```

The existing default clause keeps sending live traffic to
`messaging-admin-next.messaging-admin-next-<env>.svc.cluster.local:3022`; the cutover is then a
one-line destination change with instant rollback.

Note: `admin-next/overlays/prod-02/prod/` has **no** `virtual-service.yaml` (only dev/uat do), and
`istio/admin-next/overlays/` has no prod overlay either — prod `messaging-admin.services.gov.ie`
routing appears to come from the legacy `istio/admin/` + `admin/` trees. **Confirm who owns prod
routing before writing the prod overlay** — I could not determine this from the manifests alone.

### 3b. `profile-admin.<env>.services.gov.ie` (NOT in messaging-k8s-apps)

Nothing in `messaging-k8s-apps` serves `profile-admin.*`. That hostname's Gateway, Certificate and
VirtualService live in the profile repo (`profile-k8s-apps`), so a second PR there must route
`profile-admin.<env>.services.gov.ie` to
`public-servant-portal.messaging-public-servant-portal-<env>.svc.cluster.local:8080`
(cross-namespace destination; `PeerAuthentication` is STRICT so the caller must be in the mesh, and
the destination service needs to be exported to that namespace — istio `exportTo`/`ServiceEntry`
review required). Until that lands, only the messaging-admin zone is reachable and any
`profile-admin` link will 404 at the edge, while the app itself is already built to serve it.

## 4. Platform prerequisites (verify, don't assume)

- **ECR repository `bb-messaging-public-servant-portal`** must exist in account `428528001781`
  (eu-west-1) before the first image push. The other repos (`bb-messaging-citizen-portal`,
  `bb-messaging-admin-next`) are provisioned outside both repos — most likely
  `life-events-terraform`. **Flagged: I did not verify where ECR repos are declared.**
- **Azure DevOps pipeline registration**: a new pipeline pointing at
  `.azure/pipeline-public-servant-portal.yml` must be created under
  `Building Blocks\Messaging Team\Messaging\`. The YAML reuses existing variable groups
  (`messaging-dev` / `messaging-uat` / `messaging-prod`, `ogcio-release-please`) and the existing
  ADO environments (`$(adoEnvironment)` = `messaging-<env>`), so no new library entries are needed.
- **Nightly pipeline resource**: the pipeline consumes
  `Building Blocks\Messaging Team\Messaging\Messaging - Nightly Tests` as a `pipelines:` resource for
  the UAT promotion path — no change needed there beyond the service list entry already added to
  `.azure/azure_pipelines_nightly.yml`.
- **Bearer ignores**: `bearer.ignore` is keyed by finding fingerprint (rule + path), not by app, so
  the new app's copies of `scripts/build-with-prod-tsconfig.mjs` and
  `scripts/copy-standalone-assets.mjs` will produce the same "logger information leakage" findings
  that are already ignored for `messaging-admin-next`, under **new fingerprints**. Those hashes
  cannot be derived by hand — run `make security-scan` (or `bearer scan --exit-code 0`) once and add
  the reported ids. Deliberately not guessed here.

## 5. `messaging-admin-next` is still fully wired — cutover checklist

Nothing was removed. When the product decision to retire `messaging-admin-next` is made, these are
every remaining reference (as of this branch):

**Pipelines / release**
- `.azure/pipeline-messaging-admin-next.yml` (whole file; also delete the ADO pipeline definition)
- `.azure/azure_pipelines_nightly.yml:14` — `services:` list still contains `messaging-admin-next`
- `release-please/messaging-admin-next.config.json`, `release-please/messaging-admin-next.manifest.json`
- `sonar-project.properties:15` — `sonar.junit.reportPaths` entry `apps/messaging-admin-next/`

**Repo config / scripts**
- `pnpm-workspace.yaml:3` — `apps/messaging-admin-next` workspace entry
- `package.json` — `dev:admin-next`, `dev` / `dev:next` (both compose `pnpm dev:admin-next`),
  `build:admin-next`, `format:admin-next`, `lint:admin-next`, `test:admin-next`,
  `docker:build:admin-next`, and `docker:build` (chains `docker:build:admin-next`)
- `scripts/collect-licenses.mjs` — `APP_NAME_MAP` + `APP_ORDER` entries
- `scripts/smart-workspace-update.ts:52` — `"messaging-admin-next": ["use-intl"]` override
- `scripts/dev/pipeline-local.mjs` — unit-test, build and docker-build entries
- `scripts/dev/azure-pipeline-local.mjs` — unit-test, build, docker-build and the `📦 Services` listing
- `bearer.ignore` — two entries commented as `messaging-admin-next …` (fingerprints `501c184e…_0`, `73dab957…_0`)
- `README.md:15` — service table row (`messaging-admin-next | Next.js | 3022`)
- `apps/messaging-admin-next/**` — the app itself

**k8s (`messaging-k8s-apps`, separate repo)**
- `admin-next/base/**` and `admin-next/overlays/{non-prod-02/dev,non-prod-02/uat,prod-02/prod}/**`
- `istio/admin-next/base/**` and `istio/admin-next/overlays/non-prod-02/{dev,uat}/**`
  (gateway + cert for `messaging-admin.<env>.services.gov.ie` — **keep these**, the new app needs
  the same hostname; only the VirtualService destination changes)
- ArgoCD application(s) pointing at the `admin-next` overlays
