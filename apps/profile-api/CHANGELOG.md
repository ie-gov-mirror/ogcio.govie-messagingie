# Changelog

## [0.1.8](https://github.com/ogcio/govie-services-messaging/compare/profile-api-v0.1.7...profile-api-v0.1.8) (2026-11-17)


### Features

* run the e2e suites against the local stack AB[#46019](https://github.com/ogcio/govie-services-messaging/issues/46019) ([#1174](https://github.com/ogcio/govie-services-messaging/issues/1174)) ([fdfdba0](https://github.com/ogcio/govie-services-messaging/commit/fdfdba01842807af89d9b9f84cd8a606cb366e52))


### Bug Fixes

* compare webhook and job secrets in constant time AB[#45756](https://github.com/ogcio/govie-services-messaging/issues/45756) ([#1156](https://github.com/ogcio/govie-services-messaging/issues/1156)) ([3bdc97b](https://github.com/ogcio/govie-services-messaging/commit/3bdc97bb4965427018dd3044f75f41422f53a35f))
* **deps:** update all non-major dependencies ([#1139](https://github.com/ogcio/govie-services-messaging/issues/1139)) ([ed428f5](https://github.com/ogcio/govie-services-messaging/commit/ed428f5c46c510f67115b244fc44e5931e2bd971))
* **deps:** update all non-major dependencies ([#1161](https://github.com/ogcio/govie-services-messaging/issues/1161)) ([cc1f9c1](https://github.com/ogcio/govie-services-messaging/commit/cc1f9c1a00e38984cd931d50be0a6f4b7cfde362))
* **deps:** update all non-major dependencies ([#1172](https://github.com/ogcio/govie-services-messaging/issues/1172)) ([bf0692c](https://github.com/ogcio/govie-services-messaging/commit/bf0692cc793562487a1b15bddae4e0c3f228662a))
* **deps:** update dependency @fastify/otel to v1 ([#1141](https://github.com/ogcio/govie-services-messaging/issues/1141)) ([a119965](https://github.com/ogcio/govie-services-messaging/commit/a11996590217faeb70ae7a5aad32d721d810b1ea))
* **deps:** update dependency @ogcio/o11y-sdk-node to v0.15.0 ([#1173](https://github.com/ogcio/govie-services-messaging/issues/1173)) ([b0afe66](https://github.com/ogcio/govie-services-messaging/commit/b0afe66d808f052ee205ffb0ba507c12f8c4eadd))
* keep Fastify spans in the request trace AB[#45791](https://github.com/ogcio/govie-services-messaging/issues/45791) ([#1162](https://github.com/ogcio/govie-services-messaging/issues/1162)) ([0bba2e9](https://github.com/ogcio/govie-services-messaging/commit/0bba2e9d0da4bae3a7c4f9dae2b9632d191d7e82))
* **profile-api:** keep POST /profiles inside the token organisation AB[#45747](https://github.com/ogcio/govie-services-messaging/issues/45747) ([#1150](https://github.com/ogcio/govie-services-messaging/issues/1150)) ([b7be1bc](https://github.com/ogcio/govie-services-messaging/commit/b7be1bca36b23e7c84e59a077f294eab0f1ce73e))
* **profile-api:** require a message to the profile before linking it AB[#45748](https://github.com/ogcio/govie-services-messaging/issues/45748) ([#1151](https://github.com/ogcio/govie-services-messaging/issues/1151)) ([859c93a](https://github.com/ogcio/govie-services-messaging/commit/859c93a2775073d59945e608fe695057871cfa28))
* stop the per-request analytics event in four APIs AB[#46135](https://github.com/ogcio/govie-services-messaging/issues/46135) ([#1175](https://github.com/ogcio/govie-services-messaging/issues/1175)) ([d85f9bc](https://github.com/ogcio/govie-services-messaging/commit/d85f9bcd0536337be43bd1c49decec4fb142b5d3))
* verify the Postgres server certificate AB[#45757](https://github.com/ogcio/govie-services-messaging/issues/45757) ([#1157](https://github.com/ogcio/govie-services-messaging/issues/1157)) ([17f38ab](https://github.com/ogcio/govie-services-messaging/commit/17f38ab8691e4b32637cfb7614769b6151623ec7))


### Miscellaneous Chores

* align repo tooling AB[#45916](https://github.com/ogcio/govie-services-messaging/issues/45916) ([#1167](https://github.com/ogcio/govie-services-messaging/issues/1167)) ([84bd822](https://github.com/ogcio/govie-services-messaging/commit/84bd8225f385e29707925ba76b4f243eb8817dc3))
* update comments AB[#45996](https://github.com/ogcio/govie-services-messaging/issues/45996) ([#1169](https://github.com/ogcio/govie-services-messaging/issues/1169)) ([feb0842](https://github.com/ogcio/govie-services-messaging/commit/feb084240d290aa9330ea0f1e971a2f89858dc47))

## [0.1.7](https://github.com/ogcio/govie-services-messaging/compare/profile-api-v0.1.6...profile-api-v0.1.7) (2026-11-05)


### Bug Fixes

* **deps:** pin @logto/node to 4.0.1 AB[#44878](https://github.com/ogcio/govie-services-messaging/issues/44878) ([#1100](https://github.com/ogcio/govie-services-messaging/issues/1100)) ([700444e](https://github.com/ogcio/govie-services-messaging/commit/700444e493b051e8fd27058ad44c93b487355da4))
* **deps:** update all non-major dependencies ([#1090](https://github.com/ogcio/govie-services-messaging/issues/1090)) ([c023980](https://github.com/ogcio/govie-services-messaging/commit/c023980bf98bd413a9f5ef44dc153bcbc4f97076))
* **deps:** update all non-major dependencies ([#1116](https://github.com/ogcio/govie-services-messaging/issues/1116)) ([82f8357](https://github.com/ogcio/govie-services-messaging/commit/82f8357aff3f01ba39299a54e765de5e8bea10f6))
* **profile-api:** allow M2M onboarding reads of unlinked profiles AB[#45455](https://github.com/ogcio/govie-services-messaging/issues/45455) ([#1122](https://github.com/ogcio/govie-services-messaging/issues/1122)) ([4a0e500](https://github.com/ogcio/govie-services-messaging/commit/4a0e5000975c18cb7f142d074e93d4f423bdb9df))


### Miscellaneous Chores

* update to node 26 AB[#45024](https://github.com/ogcio/govie-services-messaging/issues/45024) ([#1102](https://github.com/ogcio/govie-services-messaging/issues/1102)) ([9eb7de0](https://github.com/ogcio/govie-services-messaging/commit/9eb7de0493593c5242ba26ab14491fb6f87256ab))

## [0.1.6](https://github.com/ogcio/govie-services-messaging/compare/profile-api-v0.1.5...profile-api-v0.1.6) (2026-10-23)


### Miscellaneous Chores

* skip optional deps in API images AB[#44878](https://github.com/ogcio/govie-services-messaging/issues/44878) ([#1082](https://github.com/ogcio/govie-services-messaging/issues/1082)) ([cd34a47](https://github.com/ogcio/govie-services-messaging/commit/cd34a475044590cb86de4be257b4bf0a95fbc68e))

## [0.1.5](https://github.com/ogcio/govie-services-messaging/compare/profile-api-v0.1.4...profile-api-v0.1.5) (2026-10-23)


### Features

* reject upload shares for missing profiles AB[#35012](https://github.com/ogcio/govie-services-messaging/issues/35012) ([#1050](https://github.com/ogcio/govie-services-messaging/issues/1050)) ([7786c24](https://github.com/ogcio/govie-services-messaging/commit/7786c244190e8b06f7092a6e3289b894a412b6c4))


### Bug Fixes

* assign citizen roles when importing profiles AB[#44551](https://github.com/ogcio/govie-services-messaging/issues/44551) ([#1043](https://github.com/ogcio/govie-services-messaging/issues/1043)) ([f4ffb29](https://github.com/ogcio/govie-services-messaging/commit/f4ffb29d2ec1224005d8ee3b29793e6c92f77649))
* **deps:** update all non-major dependencies ([#1063](https://github.com/ogcio/govie-services-messaging/issues/1063)) ([d0139ae](https://github.com/ogcio/govie-services-messaging/commit/d0139ae46dd1a53f189e836f8975219e9e4ec864))
* return 422 when a pagination limit is outside 1-100 AB[#30737](https://github.com/ogcio/govie-services-messaging/issues/30737) ([#1046](https://github.com/ogcio/govie-services-messaging/issues/1046)) ([57cb004](https://github.com/ogcio/govie-services-messaging/commit/57cb004a3650c20091885cf2b2c6b3a2c4caef75))


### Miscellaneous Chores

* update deps AB[#44227](https://github.com/ogcio/govie-services-messaging/issues/44227) ([#1072](https://github.com/ogcio/govie-services-messaging/issues/1072)) ([efeca5b](https://github.com/ogcio/govie-services-messaging/commit/efeca5b4db6131c6b9c943e7de4683e32dfde58b))
* update deps AB[#44878](https://github.com/ogcio/govie-services-messaging/issues/44878) ([#1078](https://github.com/ogcio/govie-services-messaging/issues/1078)) ([2b9558e](https://github.com/ogcio/govie-services-messaging/commit/2b9558ecb07b14b472f20d988f7f1b2d71ac4440))
* use a single Biome config AB[#44878](https://github.com/ogcio/govie-services-messaging/issues/44878) ([#1081](https://github.com/ogcio/govie-services-messaging/issues/1081)) ([496f24c](https://github.com/ogcio/govie-services-messaging/commit/496f24c426219ef23c6cda31fb11408cc40bef6c))

## [0.1.4](https://github.com/ogcio/govie-services-messaging/compare/profile-api-v0.1.3...profile-api-v0.1.4) (2026-10-12)

### Features

- **messaging-api:** adopt @ogcio/db-core Kysely layer AB[#41141](https://github.com/ogcio/govie-services-messaging/issues/41141) ([#768](https://github.com/ogcio/govie-services-messaging/issues/768)) ([5a210d4](https://github.com/ogcio/govie-services-messaging/commit/5a210d41fdab1d2d38de9607e46dece06d4069c5))


### Bug Fixes

- **deps:** update all non-major dependencies ([#1002](https://github.com/ogcio/govie-services-messaging/issues/1002)) ([4e80277](https://github.com/ogcio/govie-services-messaging/commit/4e8027747450fe0fdc816be9cd249e2a56d2a08c))
- **deps:** update all non-major dependencies ([#1024](https://github.com/ogcio/govie-services-messaging/issues/1024)) ([75e7079](https://github.com/ogcio/govie-services-messaging/commit/75e70792a4c88eea9db9e7be7196c8c166f2ba1b))
- **deps:** update all non-major dependencies ([#952](https://github.com/ogcio/govie-services-messaging/issues/952)) ([70671c4](https://github.com/ogcio/govie-services-messaging/commit/70671c43f22f78463032a20e968c5fed50a84673))
- **deps:** update all non-major dependencies ([#974](https://github.com/ogcio/govie-services-messaging/issues/974)) ([d16ccbb](https://github.com/ogcio/govie-services-messaging/commit/d16ccbbc84b6ce9c4f9aada3830f1cfb88a3fed2))
- stop profile import deadlocking the Postgres pool AB[#44081](https://github.com/ogcio/govie-services-messaging/issues/44081) ([#1001](https://github.com/ogcio/govie-services-messaging/issues/1001)) ([d21bfe0](https://github.com/ogcio/govie-services-messaging/commit/d21bfe01b35dcc5c8b1d8e2644161d31716cf737))


### Miscellaneous Chores

- **openapi:** refresh generated API definitions AB[#44058](https://github.com/ogcio/govie-services-messaging/issues/44058) ([#996](https://github.com/ogcio/govie-services-messaging/issues/996)) ([07355c0](https://github.com/ogcio/govie-services-messaging/commit/07355c06471ff3d8d2eb51e5ceb29242350fe590))
- update deps AB[#44227](https://github.com/ogcio/govie-services-messaging/issues/44227) ([#1019](https://github.com/ogcio/govie-services-messaging/issues/1019)) ([9fc95bf](https://github.com/ogcio/govie-services-messaging/commit/9fc95bf8f2d4386d28f683c802bd57c5d59322f9))
- update rds certificates AB[#43420](https://github.com/ogcio/govie-services-messaging/issues/43420) ([#985](https://github.com/ogcio/govie-services-messaging/issues/985)) ([b23a21b](https://github.com/ogcio/govie-services-messaging/commit/b23a21b01fa10bb704b504339e28847265904db5))

## [0.1.3](https://github.com/ogcio/govie-services-messaging/compare/profile-api-v0.1.2...profile-api-v0.1.3) (2026-09-16)

### Bug Fixes

- **deps:** update all non-major dependencies ([#930](https://github.com/ogcio/govie-services-messaging/issues/930)) ([b4856b9](https://github.com/ogcio/govie-services-messaging/commit/b4856b9464d10c577b5666322980e8f556e8b635))
- **profile-api:** restrict onboarding profile reads AB[#42614](https://github.com/ogcio/govie-services-messaging/issues/42614) ([#908](https://github.com/ogcio/govie-services-messaging/issues/908)) ([2ea7655](https://github.com/ogcio/govie-services-messaging/commit/2ea765506b42173f69590972a311923b32828918))
- **profile-api:** scope consent history to organisation AB[#42616](https://github.com/ogcio/govie-services-messaging/issues/42616) ([#911](https://github.com/ogcio/govie-services-messaging/issues/911)) ([a506547](https://github.com/ogcio/govie-services-messaging/commit/a506547ed74bc3474fcc44c57a757176b0bf39fb))


### Miscellaneous Chores

- pin image to 3.24 AB[#43098](https://github.com/ogcio/govie-services-messaging/issues/43098) ([#941](https://github.com/ogcio/govie-services-messaging/issues/941)) ([4e69f87](https://github.com/ogcio/govie-services-messaging/commit/4e69f8738304e8a9d419c41346be1e613f2649c4))
- update dist definition AB[#42955](https://github.com/ogcio/govie-services-messaging/issues/42955) ([#937](https://github.com/ogcio/govie-services-messaging/issues/937)) ([748f086](https://github.com/ogcio/govie-services-messaging/commit/748f086659514e54d3dec3a37ba40e687b6a7fdf))

## [0.1.2](https://github.com/ogcio/govie-services-messaging/compare/profile-api-v0.1.1...profile-api-v0.1.2) (2026-09-10)

### Features

- import profile-api into the monorepo AB[#41529](https://github.com/ogcio/govie-services-messaging/issues/41529) ([#793](https://github.com/ogcio/govie-services-messaging/issues/793)) ([89fb4b5](https://github.com/ogcio/govie-services-messaging/commit/89fb4b5c58d390213967e105ad679db7b67f79ca))
- **public-servant-portal:** consolidate admin apps AB[#41525](https://github.com/ogcio/govie-services-messaging/issues/41525) ([#834](https://github.com/ogcio/govie-services-messaging/issues/834)) ([0af2b56](https://github.com/ogcio/govie-services-messaging/commit/0af2b562d331744f4988eab404d934a04b051525))
- support-initiated user data export AB[#41557](https://github.com/ogcio/govie-services-messaging/issues/41557) ([#802](https://github.com/ogcio/govie-services-messaging/issues/802)) ([348e900](https://github.com/ogcio/govie-services-messaging/commit/348e9002905f5242b85b4e3c44d5c9ad0cc32c86))


### Bug Fixes

- **deps:** update all non-major dependencies ([#869](https://github.com/ogcio/govie-services-messaging/issues/869)) ([680dc92](https://github.com/ogcio/govie-services-messaging/commit/680dc9212263e5da43fb6925b949564e86451ca7))
- **deps:** update all non-major dependencies ([#887](https://github.com/ogcio/govie-services-messaging/issues/887)) ([a4339d1](https://github.com/ogcio/govie-services-messaging/commit/a4339d119ee115413a4f8bb5edd3c9a55c1ed824))
- ignore Go stdlib CVEs blocking upload-api Trivy/grype scans AB[#41977](https://github.com/ogcio/govie-services-messaging/issues/41977) ([#829](https://github.com/ogcio/govie-services-messaging/issues/829)) ([582ca5e](https://github.com/ogcio/govie-services-messaging/commit/582ca5eea9d0f794779a53efc6942f44752f2065))
- **profile-api:** scope data export to user's own message attachments AB[#41238](https://github.com/ogcio/govie-services-messaging/issues/41238) ([#804](https://github.com/ogcio/govie-services-messaging/issues/804)) ([e19904d](https://github.com/ogcio/govie-services-messaging/commit/e19904d23a9399e906a2cc481459699c45e12931))
- repair nodemailer v10 and vitest v5 migrations AB[#42774](https://github.com/ogcio/govie-services-messaging/issues/42774) ([#903](https://github.com/ogcio/govie-services-messaging/issues/903)) ([6d29a4a](https://github.com/ogcio/govie-services-messaging/commit/6d29a4a25104912cf150bf1ce4ba02f5ecb8f802))


### Miscellaneous Chores

- deps update AB[#42306](https://github.com/ogcio/govie-services-messaging/issues/42306) ([#853](https://github.com/ogcio/govie-services-messaging/issues/853)) ([3b207d0](https://github.com/ogcio/govie-services-messaging/commit/3b207d0226a628af1bbcfceb28dabc79645e2553))
- **deps:** update vitest monorepo to v5 (major) ([#899](https://github.com/ogcio/govie-services-messaging/issues/899)) ([5da3cfe](https://github.com/ogcio/govie-services-messaging/commit/5da3cfefc5803c9651aaa33c75fec60c91b1cad9))
- Fix citizen portal tests AB[#42515](https://github.com/ogcio/govie-services-messaging/issues/42515) ([#894](https://github.com/ogcio/govie-services-messaging/issues/894)) ([0c950d5](https://github.com/ogcio/govie-services-messaging/commit/0c950d5c8ab5a90e3f918939a906874ca506a96e))
- normalize local development scripts AB[#42440](https://github.com/ogcio/govie-services-messaging/issues/42440) ([#840](https://github.com/ogcio/govie-services-messaging/issues/840)) ([fe97f92](https://github.com/ogcio/govie-services-messaging/commit/fe97f927b9c92a1326aaa400257a920c1f1e8189))
- **profile-api:** migrate to typebox 1.x AB[#41977](https://github.com/ogcio/govie-services-messaging/issues/41977) ([#841](https://github.com/ogcio/govie-services-messaging/issues/841)) ([0fb2add](https://github.com/ogcio/govie-services-messaging/commit/0fb2add64fbaab8cd2fb12b50363ad94d53d92f4))
- smart workspace dependency update AB[#41977](https://github.com/ogcio/govie-services-messaging/issues/41977) ([#836](https://github.com/ogcio/govie-services-messaging/issues/836)) ([3462288](https://github.com/ogcio/govie-services-messaging/commit/3462288c326b7e3ca2af93e415ca43c40ce96109))
- unify and rationalize setup commands AB[#42363](https://github.com/ogcio/govie-services-messaging/issues/42363) ([#864](https://github.com/ogcio/govie-services-messaging/issues/864)) ([5f6dd94](https://github.com/ogcio/govie-services-messaging/commit/5f6dd944d32b6b187180a98824bd1456930d46d9))
