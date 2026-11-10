# public-servant-portal — deployment

The app is deployed and live in dev, uat and prod. It ships through
`.azure/pipeline-public-servant-portal.yml` (release-please, nightly, sonar, root scripts) and runs
from the manifests in [`ogcio/messaging-k8s-apps`](https://github.com/ogcio/messaging-k8s-apps).
Prod traffic still enters through the legacy admin routes; what is left is listed under
[Remaining](#remaining-prod-cutover).

Facts the build pipeline commits to (do not change on the k8s side without changing the pipeline
too):

| Thing                        | Value                                                                                                                             | Source                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Image name                   | `bb-messaging-public-servant-portal`                                                                                              | `.azure/pipeline-public-servant-portal.yml` (`services[].imageName`)                                                                       |
| ECR registry                 | `428528001781.dkr.ecr.eu-west-1.amazonaws.com`                                                                                    | `.azure/pipeline-variables/*.yml` (`ecrEndpoint`)                                                                                          |
| Overlays path                | `public-servant-portal/overlays/$(clusterName)/$(overlaysDirectory)` → `…/non-prod-02/dev`, `…/non-prod-02/uat`, `…/prod-02/prod` | `services[].overlaysPath`                                                                                                                  |
| Container port               | `8080` (nginx, unprivileged)                                                                                                      | `apps/public-servant-portal/Dockerfile` (`PORT` default)                                                                                   |
| Release tag (prod image tag) | `public-servant-portal-v<version>`                                                                                                | `release-please/public-servant-portal.config.json`                                                                                         |
| Served hostnames             | `messaging-admin.<env>.services.gov.ie` **and** `profile-admin.<env>.services.gov.ie`                                             | `MESSAGING_ADMIN_HOST` / `PROFILE_ADMIN_HOST` build args (`publicServantPortalMessagingAdminHost` / `publicServantPortalProfileAdminHost`) |

## Kubernetes (`messaging-k8s-apps`)

- `public-servant-portal/base/`: Deployment, Service, PeerAuthentication (mTLS `STRICT`) and
  ServiceEntry. Probes are `tcpSocket: 8080`: nginx only answers the two admin Host headers, so an
  `httpGet` probe (`Host: <pod-ip>`) would get a 444.
- `public-servant-portal/overlays/`:

  | Overlay           | Namespace                              | Image tag                                      |
  | ----------------- | -------------------------------------- | ---------------------------------------------- |
  | `non-prod-02/dev` | `messaging-public-servant-portal-dev`  | build id, written by the pipeline GitOps step  |
  | `non-prod-02/uat` | `messaging-public-servant-portal-uat`  | build id, written by the pipeline GitOps step  |
  | `prod-02/prod`    | `messaging-public-servant-portal-prod` | release tag `public-servant-portal-v<version>` |

- `istio/public-servant-portal/`: dev and uat each have a Gateway
  (`istio-system/messaging-public-servant-portal-<env>`), a Certificate for both hostnames and
  Istio monitors. Prod has only the Sidecar: no Gateway, and the Certificate is deleted.

## Routing

Dev and uat: the app's own Gateway and VirtualService
(`public-servant-portal/overlays/non-prod-02/<env>/virtualservice.yaml`) send both hostnames to
`public-servant-portal.messaging-public-servant-portal-<env>.svc.cluster.local:8080`.

Prod: the app has no route of its own. Both hostnames go through the legacy apps' routes, which
forward the canary cohort to this app:

```text
browser
  → CloudFront (life-events-terraform, environments/prd.tfvars:
                canary_weight = 1.0, sets x-canary: public-servant-portal)
  → messaging-admin.services.gov.ie   messaging-k8s-apps  admin-next/overlays/prod-02/prod
    profile-admin.services.gov.ie     profile-k8s-apps    admin-next/overlays/prod-02/prod
      x-canary: public-servant-portal → public-servant-portal.messaging-public-servant-portal-prod:8080
      no header (default)             → messaging-admin-next / profile-admin-next
```

Removing the legacy routes before the app has its own takes both hostnames offline.

## Remaining: prod cutover

Tracked in AB#45028:
- Give the app its own prod Gateway, Certificate and VirtualService for both hostnames, under
  `public-servant-portal` in `messaging-k8s-apps`. Hostnames and certificates stay the same.
- Then remove the `messaging-admin-next` and `profile-admin-next` prod workloads, ArgoCD apps,
  namespaces and Istio trees, and the CloudFront canary config for both hostnames.
- Swap the admin-next prod namespaces for this app in the messaging-o11y alerts, recording rules
  and dashboards.
- Delete the `bb-*-admin-next` ECR repos and the "Messaging - Admin Next" ADO pipeline definition.

Also open: `bearer.ignore` has no entries for this app's `scripts/build-with-prod-tsconfig.mjs`
and `scripts/copy-standalone-assets.mjs`, whose `messaging-admin-next` copies were ignored as
logger-leak false positives. Run a Bearer scan to see whether they are reported.
