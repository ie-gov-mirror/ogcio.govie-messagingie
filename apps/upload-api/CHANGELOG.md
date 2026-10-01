# Changelog

## [1.1.4](https://github.com/ogcio/govie-services-messaging/compare/upload-api-v1.1.3...upload-api-v1.1.4) (2026-09-16)


### Bug Fixes

* reject invalid upload scheduler callbacks with 401 AB[#42627](https://github.com/ogcio/govie-services-messaging/issues/42627) ([#918](https://github.com/ogcio/govie-services-messaging/issues/918)) ([6c053ac](https://github.com/ogcio/govie-services-messaging/commit/6c053ac064bc2b1d41f7b9eb098fce5d6c70855c))
* **upload-api:** require file access before metadata delete AB[#42618](https://github.com/ogcio/govie-services-messaging/issues/42618) ([#909](https://github.com/ogcio/govie-services-messaging/issues/909)) ([3aa22d0](https://github.com/ogcio/govie-services-messaging/commit/3aa22d04bae4e328f0f73b2ebdf056eb8bba4fe5))


### Miscellaneous Chores

* pin image to 3.24 AB[#43098](https://github.com/ogcio/govie-services-messaging/issues/43098) ([#941](https://github.com/ogcio/govie-services-messaging/issues/941)) ([4e69f87](https://github.com/ogcio/govie-services-messaging/commit/4e69f8738304e8a9d419c41346be1e613f2649c4))
* update dist definition AB[#42955](https://github.com/ogcio/govie-services-messaging/issues/42955) ([#937](https://github.com/ogcio/govie-services-messaging/issues/937)) ([748f086](https://github.com/ogcio/govie-services-messaging/commit/748f086659514e54d3dec3a37ba40e687b6a7fdf))

## [1.1.3](https://github.com/ogcio/govie-services-messaging/compare/upload-api-v1.1.2...upload-api-v1.1.3) (2026-09-14)


### Bug Fixes

* **deps:** update all non-major dependencies ([#930](https://github.com/ogcio/govie-services-messaging/issues/930)) ([b4856b9](https://github.com/ogcio/govie-services-messaging/commit/b4856b9464d10c577b5666322980e8f556e8b635))


### Miscellaneous Chores

* update deps AB[#42955](https://github.com/ogcio/govie-services-messaging/issues/42955) ([#936](https://github.com/ogcio/govie-services-messaging/issues/936)) ([adaf09f](https://github.com/ogcio/govie-services-messaging/commit/adaf09f9e64afcbe660bb7d1b30c76f7a40b8518))

## [1.1.2](https://github.com/ogcio/govie-services-messaging/compare/upload-api-v1.1.1...upload-api-v1.1.2) (2026-09-10)


### Bug Fixes

* **deps:** update all non-major dependencies ([#869](https://github.com/ogcio/govie-services-messaging/issues/869)) ([680dc92](https://github.com/ogcio/govie-services-messaging/commit/680dc9212263e5da43fb6925b949564e86451ca7))
* **deps:** update all non-major dependencies ([#887](https://github.com/ogcio/govie-services-messaging/issues/887)) ([a4339d1](https://github.com/ogcio/govie-services-messaging/commit/a4339d119ee115413a4f8bb5edd3c9a55c1ed824))
* stop reliability bugs from leaking as unhandled errors AB[#42306](https://github.com/ogcio/govie-services-messaging/issues/42306) ([#884](https://github.com/ogcio/govie-services-messaging/issues/884)) ([e639509](https://github.com/ogcio/govie-services-messaging/commit/e639509b8ddbd9b5984af23decbf291e4d6cabbb))


### Miscellaneous Chores

* deps update AB[#42306](https://github.com/ogcio/govie-services-messaging/issues/42306) ([#853](https://github.com/ogcio/govie-services-messaging/issues/853)) ([3b207d0](https://github.com/ogcio/govie-services-messaging/commit/3b207d0226a628af1bbcfceb28dabc79645e2553))
* **deps:** update vitest monorepo to v5 (major) ([#899](https://github.com/ogcio/govie-services-messaging/issues/899)) ([5da3cfe](https://github.com/ogcio/govie-services-messaging/commit/5da3cfefc5803c9651aaa33c75fec60c91b1cad9))
* normalize local development scripts AB[#42440](https://github.com/ogcio/govie-services-messaging/issues/42440) ([#840](https://github.com/ogcio/govie-services-messaging/issues/840)) ([fe97f92](https://github.com/ogcio/govie-services-messaging/commit/fe97f927b9c92a1326aaa400257a920c1f1e8189))
* unify and rationalize setup commands AB[#42363](https://github.com/ogcio/govie-services-messaging/issues/42363) ([#864](https://github.com/ogcio/govie-services-messaging/issues/864)) ([5f6dd94](https://github.com/ogcio/govie-services-messaging/commit/5f6dd944d32b6b187180a98824bd1456930d46d9))

## [1.1.1](https://github.com/ogcio/govie-services-messaging/compare/upload-api-v1.1.0...upload-api-v1.1.1) (2026-08-24)


### Bug Fixes

* ignore Go stdlib CVEs blocking upload-api Trivy/grype scans AB[#41977](https://github.com/ogcio/govie-services-messaging/issues/41977) ([#829](https://github.com/ogcio/govie-services-messaging/issues/829)) ([582ca5e](https://github.com/ogcio/govie-services-messaging/commit/582ca5eea9d0f794779a53efc6942f44752f2065))
* upload-api cleanup webhook double-slash 404 AB[#41588](https://github.com/ogcio/govie-services-messaging/issues/41588) ([#808](https://github.com/ogcio/govie-services-messaging/issues/808)) ([dd01457](https://github.com/ogcio/govie-services-messaging/commit/dd0145717ec1e8b45a837acb5a83ae68a3c37439))


### Miscellaneous Chores

* smart workspace dependency update AB[#41977](https://github.com/ogcio/govie-services-messaging/issues/41977) ([#836](https://github.com/ogcio/govie-services-messaging/issues/836)) ([3462288](https://github.com/ogcio/govie-services-messaging/commit/3462288c326b7e3ca2af93e415ca43c40ce96109))

## [1.1.0](https://github.com/ogcio/govie-services-messaging/compare/upload-api-v1.0.0...upload-api-v1.1.0) (2026-08-03)


### Features

* import upload-api and scheduler-api from life-events AB[#41432](https://github.com/ogcio/govie-services-messaging/issues/41432) ([#784](https://github.com/ogcio/govie-services-messaging/issues/784)) ([b406ea4](https://github.com/ogcio/govie-services-messaging/commit/b406ea498335b2005aee837473090f4ea395d005))
