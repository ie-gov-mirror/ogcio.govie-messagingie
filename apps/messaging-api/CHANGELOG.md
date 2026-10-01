# Changelog

## [1.2.2](https://github.com/ogcio/govie-services-messaging/compare/messaging-api-v1.2.1...messaging-api-v1.2.2) (2026-09-16)


### Bug Fixes

* **deps:** update all non-major dependencies ([#930](https://github.com/ogcio/govie-services-messaging/issues/930)) ([b4856b9](https://github.com/ogcio/govie-services-messaging/commit/b4856b9464d10c577b5666322980e8f556e8b635))
* sanitize rich message HTML AB[#42622](https://github.com/ogcio/govie-services-messaging/issues/42622) ([#913](https://github.com/ogcio/govie-services-messaging/issues/913)) ([9d0d133](https://github.com/ogcio/govie-services-messaging/commit/9d0d13309fa1944537e88f956f7732a63511c5ff))


### Miscellaneous Chores

* pin image to 3.24 AB[#43098](https://github.com/ogcio/govie-services-messaging/issues/43098) ([#941](https://github.com/ogcio/govie-services-messaging/issues/941)) ([4e69f87](https://github.com/ogcio/govie-services-messaging/commit/4e69f8738304e8a9d419c41346be1e613f2649c4))
* update dist definition AB[#42955](https://github.com/ogcio/govie-services-messaging/issues/42955) ([#937](https://github.com/ogcio/govie-services-messaging/issues/937)) ([748f086](https://github.com/ogcio/govie-services-messaging/commit/748f086659514e54d3dec3a37ba40e687b6a7fdf))

## [1.2.1](https://github.com/ogcio/govie-services-messaging/compare/messaging-api-v1.2.0...messaging-api-v1.2.1) (2026-09-10)


### Bug Fixes

* **deps:** pin @opentelemetry/core for GHSA-8988-4f7v-96qf AB[#42306](https://github.com/ogcio/govie-services-messaging/issues/42306) ([#870](https://github.com/ogcio/govie-services-messaging/issues/870)) ([5fe3e09](https://github.com/ogcio/govie-services-messaging/commit/5fe3e09069ce47eda40ee76bd0e09fc70569e8fc))
* **deps:** update all non-major dependencies ([#869](https://github.com/ogcio/govie-services-messaging/issues/869)) ([680dc92](https://github.com/ogcio/govie-services-messaging/commit/680dc9212263e5da43fb6925b949564e86451ca7))
* **deps:** update all non-major dependencies ([#887](https://github.com/ogcio/govie-services-messaging/issues/887)) ([a4339d1](https://github.com/ogcio/govie-services-messaging/commit/a4339d119ee115413a4f8bb5edd3c9a55c1ed824))
* **deps:** update dependency nodemailer to v10 ([#900](https://github.com/ogcio/govie-services-messaging/issues/900)) ([ecaf6e0](https://github.com/ogcio/govie-services-messaging/commit/ecaf6e05a24747415b01ebd15e22e1c96cb7063a))
* **messaging-api:** incoherent error code on downstream 404 AB[#42352](https://github.com/ogcio/govie-services-messaging/issues/42352) ([#860](https://github.com/ogcio/govie-services-messaging/issues/860)) ([17c01f7](https://github.com/ogcio/govie-services-messaging/commit/17c01f74fdb0de30bb0f0e904899199220c0a7ab))
* repair nodemailer v10 and vitest v5 migrations AB[#42774](https://github.com/ogcio/govie-services-messaging/issues/42774) ([#903](https://github.com/ogcio/govie-services-messaging/issues/903)) ([6d29a4a](https://github.com/ogcio/govie-services-messaging/commit/6d29a4a25104912cf150bf1ce4ba02f5ecb8f802))
* stop reliability bugs from leaking as unhandled errors AB[#42306](https://github.com/ogcio/govie-services-messaging/issues/42306) ([#884](https://github.com/ogcio/govie-services-messaging/issues/884)) ([e639509](https://github.com/ogcio/govie-services-messaging/commit/e639509b8ddbd9b5984af23decbf291e4d6cabbb))


### Miscellaneous Chores

* deps update AB[#42306](https://github.com/ogcio/govie-services-messaging/issues/42306) ([#853](https://github.com/ogcio/govie-services-messaging/issues/853)) ([3b207d0](https://github.com/ogcio/govie-services-messaging/commit/3b207d0226a628af1bbcfceb28dabc79645e2553))
* **deps:** update vitest monorepo to v5 (major) ([#899](https://github.com/ogcio/govie-services-messaging/issues/899)) ([5da3cfe](https://github.com/ogcio/govie-services-messaging/commit/5da3cfefc5803c9651aaa33c75fec60c91b1cad9))
* Fix citizen portal tests AB[#42515](https://github.com/ogcio/govie-services-messaging/issues/42515) ([#894](https://github.com/ogcio/govie-services-messaging/issues/894)) ([0c950d5](https://github.com/ogcio/govie-services-messaging/commit/0c950d5c8ab5a90e3f918939a906874ca506a96e))
* Fix failing messaging api test AB[#42515](https://github.com/ogcio/govie-services-messaging/issues/42515) ([#891](https://github.com/ogcio/govie-services-messaging/issues/891)) ([5fa6771](https://github.com/ogcio/govie-services-messaging/commit/5fa677168aebc51b1b414c72aca83c1ef36e946e))
* stop warning when falling back to default email provider AB[#42517](https://github.com/ogcio/govie-services-messaging/issues/42517) ([#889](https://github.com/ogcio/govie-services-messaging/issues/889)) ([1ea5aa9](https://github.com/ogcio/govie-services-messaging/commit/1ea5aa94981c776766325a926b6d25049968f5e4))
* unify and rationalize setup commands AB[#42363](https://github.com/ogcio/govie-services-messaging/issues/42363) ([#864](https://github.com/ogcio/govie-services-messaging/issues/864)) ([5f6dd94](https://github.com/ogcio/govie-services-messaging/commit/5f6dd944d32b6b187180a98824bd1456930d46d9))

## [1.2.0](https://github.com/ogcio/govie-services-messaging/compare/messaging-api-v1.1.0...messaging-api-v1.2.0) (2026-08-24)


### Features

* change attachments size limit to 3x5mb AB[#37833](https://github.com/ogcio/govie-services-messaging/issues/37833) ([#759](https://github.com/ogcio/govie-services-messaging/issues/759)) ([fa00f62](https://github.com/ogcio/govie-services-messaging/commit/fa00f62d6b950d16b032b92ae6056ab66bab2539))
* improve metrics AB[#40868](https://github.com/ogcio/govie-services-messaging/issues/40868) ([#727](https://github.com/ogcio/govie-services-messaging/issues/727)) ([a3372df](https://github.com/ogcio/govie-services-messaging/commit/a3372df5297ea9c6a5f31bd7671130f79df49246))
* **messaging-api:** add unique(message_id, attachment_id) on attachments_messages AB[#41240](https://github.com/ogcio/govie-services-messaging/issues/41240) ([#781](https://github.com/ogcio/govie-services-messaging/issues/781)) ([00b0bc1](https://github.com/ogcio/govie-services-messaging/commit/00b0bc1a48bf8013bb4339d24749e8073d23b40b))
* **messaging-api:** per-user / batched files_users cleanse AB[#41238](https://github.com/ogcio/govie-services-messaging/issues/41238) ([#816](https://github.com/ogcio/govie-services-messaging/issues/816)) ([ffea0c4](https://github.com/ogcio/govie-services-messaging/commit/ffea0c4878c14cf7178451d12e88ee3067151ed2))


### Bug Fixes

* event log order and align schedule date AB[#28388](https://github.com/ogcio/govie-services-messaging/issues/28388) ([#798](https://github.com/ogcio/govie-services-messaging/issues/798)) ([e5d0286](https://github.com/ogcio/govie-services-messaging/commit/e5d02866e42d30f127dd9959f417f103f4c24a9b))
* ignore Go stdlib CVEs blocking upload-api Trivy/grype scans AB[#41977](https://github.com/ogcio/govie-services-messaging/issues/41977) ([#829](https://github.com/ogcio/govie-services-messaging/issues/829)) ([582ca5e](https://github.com/ogcio/govie-services-messaging/commit/582ca5eea9d0f794779a53efc6942f44752f2065))


### Miscellaneous Chores

* Fix nightly profile-api and messaging-api tests AB[#41529](https://github.com/ogcio/govie-services-messaging/issues/41529) ([#809](https://github.com/ogcio/govie-services-messaging/issues/809)) ([a9754c7](https://github.com/ogcio/govie-services-messaging/commit/a9754c75af3577ce036d4a707c847ce77ed065ee))
* **messaging-api:** add files_users cleanse operator scripts AB[#41238](https://github.com/ogcio/govie-services-messaging/issues/41238) ([#786](https://github.com/ogcio/govie-services-messaging/issues/786)) ([aa21a0b](https://github.com/ogcio/govie-services-messaging/commit/aa21a0b850bbef10659fa100b1cba268fe303e2b))
* **messaging-api:** add reproduce-export-leak operator task AB[#41237](https://github.com/ogcio/govie-services-messaging/issues/41237) ([#771](https://github.com/ogcio/govie-services-messaging/issues/771)) ([4dc3e2e](https://github.com/ogcio/govie-services-messaging/commit/4dc3e2e0c7bd9391eeeffe5ceefd073a650e9000))
* **messaging-api:** regenerate openapi-definition.yml AB[#00001](https://github.com/ogcio/govie-services-messaging/issues/00001) ([#788](https://github.com/ogcio/govie-services-messaging/issues/788)) ([e3e5d0c](https://github.com/ogcio/govie-services-messaging/commit/e3e5d0ccf9b7fe69ab878392b85e9798465df55b))
* remove unused backfill job files and deps AB[#41107](https://github.com/ogcio/govie-services-messaging/issues/41107) ([#766](https://github.com/ogcio/govie-services-messaging/issues/766)) ([c3de60b](https://github.com/ogcio/govie-services-messaging/commit/c3de60b70180c3c5485da809f6df7775a8eaf66a))
* smart workspace dependency update AB[#41977](https://github.com/ogcio/govie-services-messaging/issues/41977) ([#836](https://github.com/ogcio/govie-services-messaging/issues/836)) ([3462288](https://github.com/ogcio/govie-services-messaging/commit/3462288c326b7e3ca2af93e415ca43c40ce96109))

## [1.1.0](https://github.com/ogcio/govie-services-messaging/compare/messaging-api-v1.0.0...messaging-api-v1.1.0) (2026-07-22)


### Features

* AB[#32991](https://github.com/ogcio/govie-services-messaging/issues/32991) Get events for a single message endpoint ([#202](https://github.com/ogcio/govie-services-messaging/issues/202)) ([6cc67bc](https://github.com/ogcio/govie-services-messaging/commit/6cc67bc1ffa72ba8f75b8c69643b023e08838933))
* AB[#32991](https://github.com/ogcio/govie-services-messaging/issues/32991) search events by ppsn and by recipient id ([#201](https://github.com/ogcio/govie-services-messaging/issues/201)) ([634d3d4](https://github.com/ogcio/govie-services-messaging/commit/634d3d431ecf8b5a8f166e3a5e9c203aa5929e24))
* AB[#32999](https://github.com/ogcio/govie-services-messaging/issues/32999) renamed deleted template ([#222](https://github.com/ogcio/govie-services-messaging/issues/222)) ([ce2626e](https://github.com/ogcio/govie-services-messaging/commit/ce2626e73f45593a973945756722612949d9e74e))
* AB[#33408](https://github.com/ogcio/govie-services-messaging/issues/33408) local jwks ([#235](https://github.com/ogcio/govie-services-messaging/issues/235)) ([14ebf52](https://github.com/ogcio/govie-services-messaging/commit/14ebf5293c6d4f771a09232623d3327004a9a7a8))
* AB[#35480](https://github.com/ogcio/govie-services-messaging/issues/35480) accept external-id ([#320](https://github.com/ogcio/govie-services-messaging/issues/320)) ([80f55b1](https://github.com/ogcio/govie-services-messaging/commit/80f55b1d22daa7acd0905b0be6d633cced268474))
* AB[#36316](https://github.com/ogcio/govie-services-messaging/issues/36316) rename provider on delete ([#418](https://github.com/ogcio/govie-services-messaging/issues/418)) ([f6454dd](https://github.com/ogcio/govie-services-messaging/commit/f6454dd9b5bc688c0ee60c3af3776ff479e7b1f5))
* AB[#36585](https://github.com/ogcio/govie-services-messaging/issues/36585) use api search ([#439](https://github.com/ogcio/govie-services-messaging/issues/439)) ([48ebacc](https://github.com/ogcio/govie-services-messaging/commit/48ebaccf2397440062b975a3d421d49438a508b5))
* **AB#37462:** add messaging-admin-next Next.js 16 static export admin app ([#567](https://github.com/ogcio/govie-services-messaging/issues/567)) ([57b2d75](https://github.com/ogcio/govie-services-messaging/commit/57b2d7580386493ae8a835a12eab71836e8ea55c))
* **AB#37842:** wire message folders to tags API in unified inbox ([#650](https://github.com/ogcio/govie-services-messaging/issues/650)) ([9ba27d2](https://github.com/ogcio/govie-services-messaging/commit/9ba27d20be250533da3507b26870107ddd3fcdf6))
* **AB#39014:** fix template search freeze and improve search performance ([#599](https://github.com/ogcio/govie-services-messaging/issues/599)) ([791e0d4](https://github.com/ogcio/govie-services-messaging/commit/791e0d4ce7169aa9eecc0503c7ad8e8e8228c435))
* add sentry ([#208](https://github.com/ogcio/govie-services-messaging/issues/208)) ([dc7fac4](https://github.com/ogcio/govie-services-messaging/commit/dc7fac4290ee473931503227efd6d1d133fdeb5c))
* add sentry to messaging admin - AB[#33095](https://github.com/ogcio/govie-services-messaging/issues/33095) ([#210](https://github.com/ogcio/govie-services-messaging/issues/210)) ([900e3c2](https://github.com/ogcio/govie-services-messaging/commit/900e3c2ad2ddfb9d7be16024068ca2c2ae7427a4))
* add-external-id-to-metrics ([#323](https://github.com/ogcio/govie-services-messaging/issues/323)) ([65d33eb](https://github.com/ogcio/govie-services-messaging/commit/65d33eb97aa7012e703a06bb9de71450d6ab6bee))
* added smart updates AB[#37011](https://github.com/ogcio/govie-services-messaging/issues/37011) ([#480](https://github.com/ogcio/govie-services-messaging/issues/480)) ([e9f0eb6](https://github.com/ogcio/govie-services-messaging/commit/e9f0eb6d82e515cf295e1097d1dcb5e96e71a186))
* added support send message AB[#35473](https://github.com/ogcio/govie-services-messaging/issues/35473) ([#422](https://github.com/ogcio/govie-services-messaging/issues/422)) ([bd92d49](https://github.com/ogcio/govie-services-messaging/commit/bd92d491ead8940600d602c4bbc794363c9a7dee))
* added verify smtp script AB[#38766](https://github.com/ogcio/govie-services-messaging/issues/38766) ([#586](https://github.com/ogcio/govie-services-messaging/issues/586)) ([bc90060](https://github.com/ogcio/govie-services-messaging/commit/bc9006061f0fcf2d673d5a198044d570358e66c8))
* announcements modal AB[#37518](https://github.com/ogcio/govie-services-messaging/issues/37518) ([#551](https://github.com/ogcio/govie-services-messaging/issues/551)) ([101fa56](https://github.com/ogcio/govie-services-messaging/commit/101fa56379273ec730283e3c5b0894f9f0088377))
* backfill auth handling AB[#40032](https://github.com/ogcio/govie-services-messaging/issues/40032) ([#670](https://github.com/ogcio/govie-services-messaging/issues/670)) ([2b77905](https://github.com/ogcio/govie-services-messaging/commit/2b7790564a967d1897b6e9665bea79fcef8b7110))
* bypass consent part 1 - use api auth 6.0.0 AB[#39510](https://github.com/ogcio/govie-services-messaging/issues/39510) ([#628](https://github.com/ogcio/govie-services-messaging/issues/628)) ([1dfd620](https://github.com/ogcio/govie-services-messaging/commit/1dfd620089c93ff5447328f361a2124778d16040))
* bypass consent part 2 AB[#39510](https://github.com/ogcio/govie-services-messaging/issues/39510) ([#629](https://github.com/ogcio/govie-services-messaging/issues/629)) ([06f67eb](https://github.com/ogcio/govie-services-messaging/commit/06f67eb83c8d5d5ea0e2158020d4e1f02f92a41a))
* cache linked profiles ([#467](https://github.com/ogcio/govie-services-messaging/issues/467)) ([4276cc8](https://github.com/ogcio/govie-services-messaging/commit/4276cc87ecfca5ab237889b4ac51e03b68ec9ae8))
* create sonarqube project file and export lcov coverage reports ([#353](https://github.com/ogcio/govie-services-messaging/issues/353)) ([ebfb571](https://github.com/ogcio/govie-services-messaging/commit/ebfb571f2e6729b8bee40bf17159ff7bbae8eead))
* digital wallet pilot v2 AB[#38766](https://github.com/ogcio/govie-services-messaging/issues/38766) ([#582](https://github.com/ogcio/govie-services-messaging/issues/582)) ([299dbbd](https://github.com/ogcio/govie-services-messaging/commit/299dbbdd48c7bdfaafe9cbfa5fc0f32d562d0c0b))
* ignore deleted messages AB[#37007](https://github.com/ogcio/govie-services-messaging/issues/37007) ([#484](https://github.com/ogcio/govie-services-messaging/issues/484)) ([027f58c](https://github.com/ogcio/govie-services-messaging/commit/027f58ccb80e250ac1fc42d2119566c6fd5e08cd))
* manage PG ssl connection AB[#39133](https://github.com/ogcio/govie-services-messaging/issues/39133) ([#603](https://github.com/ogcio/govie-services-messaging/issues/603)) ([d4a90c7](https://github.com/ogcio/govie-services-messaging/commit/d4a90c7bae7c7b82eab71212ee4b15a5ce4b3359))
* managed non-active profiles AB[#34055](https://github.com/ogcio/govie-services-messaging/issues/34055) ([#259](https://github.com/ogcio/govie-services-messaging/issues/259)) ([95e0a43](https://github.com/ogcio/govie-services-messaging/commit/95e0a431bc317393652ed597e4524353eefa5a2c))
* messages folders AB[#37476](https://github.com/ogcio/govie-services-messaging/issues/37476) ([#518](https://github.com/ogcio/govie-services-messaging/issues/518)) ([0587d99](https://github.com/ogcio/govie-services-messaging/commit/0587d99e30400e823f547897303f84c5facd0820))
* **messaging-api:** add custom metrics to messaging API AB[#35169](https://github.com/ogcio/govie-services-messaging/issues/35169) ([#288](https://github.com/ogcio/govie-services-messaging/issues/288)) ([0d871d8](https://github.com/ogcio/govie-services-messaging/commit/0d871d8f1559980a4e83d158324c3178ba44050a))
* **messaging-api:** metrics backfill job AB[#38324](https://github.com/ogcio/govie-services-messaging/issues/38324) ([#578](https://github.com/ogcio/govie-services-messaging/issues/578)) ([35dd2c6](https://github.com/ogcio/govie-services-messaging/commit/35dd2c6307dfc6fc2c444c9f2d2cb79a527f3f28))
* metrics exporter job AB[#31615](https://github.com/ogcio/govie-services-messaging/issues/31615) ([#367](https://github.com/ogcio/govie-services-messaging/issues/367)) ([31e9871](https://github.com/ogcio/govie-services-messaging/commit/31e987170411b8f3086ea5c0b9bb5cdc8d630d3b))
* Next 16 + SAG ([#286](https://github.com/ogcio/govie-services-messaging/issues/286)) ([a3a767b](https://github.com/ogcio/govie-services-messaging/commit/a3a767bb9043d981d216a81b0779cca019eab1b9))
* pii hasher AB[#37169](https://github.com/ogcio/govie-services-messaging/issues/37169) ([#655](https://github.com/ogcio/govie-services-messaging/issues/655)) ([fd1a5fb](https://github.com/ogcio/govie-services-messaging/commit/fd1a5fb4969f813a186ec9bf35d4d8ed66e70133))
* pii-hash userId locally AB[#37169](https://github.com/ogcio/govie-services-messaging/issues/37169) ([#687](https://github.com/ogcio/govie-services-messaging/issues/687)) ([5f60540](https://github.com/ogcio/govie-services-messaging/commit/5f605404733fc32d0b20be561713ceefcd4286ef))
* soft delete messages AB[#37007](https://github.com/ogcio/govie-services-messaging/issues/37007) ([#478](https://github.com/ogcio/govie-services-messaging/issues/478)) ([35cd9a6](https://github.com/ogcio/govie-services-messaging/commit/35cd9a6b7897276f6ee3d7d9c80e813ab6a4ee96))
* support endpoints for export AB[#35726](https://github.com/ogcio/govie-services-messaging/issues/35726)  ([#400](https://github.com/ogcio/govie-services-messaging/issues/400)) ([3478836](https://github.com/ogcio/govie-services-messaging/commit/34788361b8fb7a45f2cf731eae3bda4c03fa6496))
* unified inbox AB[#34900](https://github.com/ogcio/govie-services-messaging/issues/34900) ([#450](https://github.com/ogcio/govie-services-messaging/issues/450)) ([e763c13](https://github.com/ogcio/govie-services-messaging/commit/e763c13df51cb02253c42bc4f3a5f69c1a719123))
* update announcements AB[#37518](https://github.com/ogcio/govie-services-messaging/issues/37518) ([#574](https://github.com/ogcio/govie-services-messaging/issues/574)) ([1f5ca40](https://github.com/ogcio/govie-services-messaging/commit/1f5ca400f95486ab0cf5ca82a918e612902634f1))
* update ds and remove patch AB[#35974](https://github.com/ogcio/govie-services-messaging/issues/35974) ([#449](https://github.com/ogcio/govie-services-messaging/issues/449)) ([1339654](https://github.com/ogcio/govie-services-messaging/commit/1339654ab107e7ffc339aed84d987ea0c0ca0990))
* update ds in messaging-next and remove patch ([1339654](https://github.com/ogcio/govie-services-messaging/commit/1339654ab107e7ffc339aed84d987ea0c0ca0990))


### Bug Fixes

* AB[#33086](https://github.com/ogcio/govie-services-messaging/issues/33086) write error events when a message fails to be sent ([#205](https://github.com/ogcio/govie-services-messaging/issues/205)) ([fa582e8](https://github.com/ogcio/govie-services-messaging/commit/fa582e829048207211ab278b666d1808d2494084))
* allow moving linked-profile messages to folders AB[#40427](https://github.com/ogcio/govie-services-messaging/issues/40427) ([#689](https://github.com/ogcio/govie-services-messaging/issues/689)) ([551f99a](https://github.com/ogcio/govie-services-messaging/commit/551f99acdbff1a0c79877a7dcc16461c9e2d93a1))
* announcements modal version update AB[#37734](https://github.com/ogcio/govie-services-messaging/issues/37734) ([#558](https://github.com/ogcio/govie-services-messaging/issues/558)) ([f5b891a](https://github.com/ogcio/govie-services-messaging/commit/f5b891a3784da6c5878f7a83b890556b2afda054))
* decrypt password on non-primary AB[#38766](https://github.com/ogcio/govie-services-messaging/issues/38766) ([#589](https://github.com/ogcio/govie-services-messaging/issues/589)) ([dd67c84](https://github.com/ogcio/govie-services-messaging/commit/dd67c84d9fe215eda0e2daf3f1a1bf6d9662669e))
* **deps:** update all non-major dependencies ([#505](https://github.com/ogcio/govie-services-messaging/issues/505)) ([16bd949](https://github.com/ogcio/govie-services-messaging/commit/16bd949664cc2c796694f0d29644016fde90942b))
* **deps:** update all non-major dependencies ([#510](https://github.com/ogcio/govie-services-messaging/issues/510)) ([87a1097](https://github.com/ogcio/govie-services-messaging/commit/87a1097c4dee009519a05450b1a3e7bcee38fa9c))
* **deps:** update all non-major dependencies ([#702](https://github.com/ogcio/govie-services-messaging/issues/702)) ([9eeec8a](https://github.com/ogcio/govie-services-messaging/commit/9eeec8a5c5145da591c79f8822add98b019f3610))
* **deps:** update dependency @cacheable/node-cache to v3 ([#430](https://github.com/ogcio/govie-services-messaging/issues/430)) ([d0d2e76](https://github.com/ogcio/govie-services-messaging/commit/d0d2e76cae93d9274da7e097fd2a463dd3d75102))
* expose isSeen on /messages list response AB[#37868](https://github.com/ogcio/govie-services-messaging/issues/37868) ([#540](https://github.com/ogcio/govie-services-messaging/issues/540)) ([bfa23fb](https://github.com/ogcio/govie-services-messaging/commit/bfa23fb47a04e665e4aad4138afe718855cb395b))
* health ignore istrumentation AB[#37465](https://github.com/ogcio/govie-services-messaging/issues/37465) ([#527](https://github.com/ogcio/govie-services-messaging/issues/527)) ([a34f039](https://github.com/ogcio/govie-services-messaging/commit/a34f039388c8781a8dc38ab0fa993957391b1b50))
* metrics backfill AB[#40032](https://github.com/ogcio/govie-services-messaging/issues/40032) ([#693](https://github.com/ogcio/govie-services-messaging/issues/693)) ([6aba62c](https://github.com/ogcio/govie-services-messaging/commit/6aba62c7e3d0850437b341f5a7df8f19aa6e980c))
* missing health ready in ignore o11y AB[#00001](https://github.com/ogcio/govie-services-messaging/issues/00001) ([#660](https://github.com/ogcio/govie-services-messaging/issues/660)) ([0525b10](https://github.com/ogcio/govie-services-messaging/commit/0525b1035d7387c14197737a38f4162464353457))
* override consent scope AB[#38717](https://github.com/ogcio/govie-services-messaging/issues/38717) ([#649](https://github.com/ogcio/govie-services-messaging/issues/649)) ([3c22eef](https://github.com/ogcio/govie-services-messaging/commit/3c22eef5d3e07db7cf6da75d1a3d4538a5103da6))
* redirection management in new messaging ([#152](https://github.com/ogcio/govie-services-messaging/issues/152)) ([517c2f0](https://github.com/ogcio/govie-services-messaging/commit/517c2f06afcd6ea4042b8b20589b5df9c107b44c))
* remove cache AB[#37107](https://github.com/ogcio/govie-services-messaging/issues/37107) ([#479](https://github.com/ogcio/govie-services-messaging/issues/479)) ([cc25012](https://github.com/ogcio/govie-services-messaging/commit/cc250124e8302fd2e6c70e744d8056d73231ab46))
* remove externalId from metrics AB[#31615](https://github.com/ogcio/govie-services-messaging/issues/31615) ([#486](https://github.com/ogcio/govie-services-messaging/issues/486)) ([81e9168](https://github.com/ogcio/govie-services-messaging/commit/81e9168122fd4cbb3d396b4a4daf000b2172c0c5))
* remove schedule scope for sending messages AB[#00001](https://github.com/ogcio/govie-services-messaging/issues/00001) ([#653](https://github.com/ogcio/govie-services-messaging/issues/653)) ([9242114](https://github.com/ogcio/govie-services-messaging/commit/92421140b9c3eed0b5583ea81fefd3f6fc544feb))
* remove single collectorMode from api instrumentation AB[#35293](https://github.com/ogcio/govie-services-messaging/issues/35293) ([#343](https://github.com/ogcio/govie-services-messaging/issues/343)) ([bb97ecf](https://github.com/ogcio/govie-services-messaging/commit/bb97ecf2bf75bdef97a0dcdfdbbe08da1e9052f5))
* rollback ([#295](https://github.com/ogcio/govie-services-messaging/issues/295)) ([ae8472d](https://github.com/ogcio/govie-services-messaging/commit/ae8472ddfcbf9d327d0027bbc8bc4ad777596491))
* rollback scope check on get message AB[#00001](https://github.com/ogcio/govie-services-messaging/issues/00001) ([#633](https://github.com/ogcio/govie-services-messaging/issues/633)) ([4478721](https://github.com/ogcio/govie-services-messaging/commit/4478721157c2bce874acc0e0f82e7d739435b36e))
* service name env variable ([#358](https://github.com/ogcio/govie-services-messaging/issues/358)) ([f45b2ea](https://github.com/ogcio/govie-services-messaging/commit/f45b2ea1293eb645986f08901ced174c4a7f2aa2))
* set bypassconsent to false in tests AB[#00001](https://github.com/ogcio/govie-services-messaging/issues/00001) ([#632](https://github.com/ogcio/govie-services-messaging/issues/632)) ([394556f](https://github.com/ogcio/govie-services-messaging/commit/394556fb597803c891bc2464991fa12b29c6a899))
* set trace errors to false ([#473](https://github.com/ogcio/govie-services-messaging/issues/473)) ([f5c816c](https://github.com/ogcio/govie-services-messaging/commit/f5c816cd89d47af479d2e953ebfb14f1733bd437))
* sonarqube integration ([#474](https://github.com/ogcio/govie-services-messaging/issues/474)) ([095624b](https://github.com/ogcio/govie-services-messaging/commit/095624b42c875f14d3ecbb6a5cf7f29c679746c4))
* trivy AB[#37011](https://github.com/ogcio/govie-services-messaging/issues/37011) ([#502](https://github.com/ogcio/govie-services-messaging/issues/502)) ([f58e4e8](https://github.com/ogcio/govie-services-messaging/commit/f58e4e8e0cec1dbc1be536c9984609609570e135))
* update vulnerability ([#290](https://github.com/ogcio/govie-services-messaging/issues/290)) ([9373ed9](https://github.com/ogcio/govie-services-messaging/commit/9373ed98b306fd45564fdd1c408134bf8119dd2b))
* updated packages ([#274](https://github.com/ogcio/govie-services-messaging/issues/274)) ([73162c9](https://github.com/ogcio/govie-services-messaging/commit/73162c995b4a2df15e35b4cb18a24608888f5ac2))


### Miscellaneous Chores

* AB[#34749](https://github.com/ogcio/govie-services-messaging/issues/34749) upgrade deps ([#280](https://github.com/ogcio/govie-services-messaging/issues/280)) ([602fd1e](https://github.com/ogcio/govie-services-messaging/commit/602fd1efb677252a026ef7eab4c748274b5cd849))
* AB[#35275](https://github.com/ogcio/govie-services-messaging/issues/35275) update packages api ([#301](https://github.com/ogcio/govie-services-messaging/issues/301)) ([2a1b271](https://github.com/ogcio/govie-services-messaging/commit/2a1b271d14907317b6611bc19627b2c01e011efe))
* add k8s attributes provided by local forwarder AB[#40032](https://github.com/ogcio/govie-services-messaging/issues/40032) ([#680](https://github.com/ogcio/govie-services-messaging/issues/680)) ([87bd97c](https://github.com/ogcio/govie-services-messaging/commit/87bd97c4d0b56142945909117324843878c2e63f))
* add request body log AB[#40032](https://github.com/ogcio/govie-services-messaging/issues/40032) ([#678](https://github.com/ogcio/govie-services-messaging/issues/678)) ([5f241ce](https://github.com/ogcio/govie-services-messaging/commit/5f241ce62799ec997199e91101a0ffc77a1cf324))
* align dependencies ([#458](https://github.com/ogcio/govie-services-messaging/issues/458)) ([7df14c8](https://github.com/ogcio/govie-services-messaging/commit/7df14c82260f4478f97880ca3fec6088294724dc))
* commented out o11y ([#470](https://github.com/ogcio/govie-services-messaging/issues/470)) ([9d9d4f7](https://github.com/ogcio/govie-services-messaging/commit/9d9d4f704ff07b25599697c8641cbed4ba053d5a))
* cpu improvements ([#469](https://github.com/ogcio/govie-services-messaging/issues/469)) ([a95e3aa](https://github.com/ogcio/govie-services-messaging/commit/a95e3aa892d136bd6c2fd052abe3ae0467ae980e))
* debug log for metrics exporter AB[#31615](https://github.com/ogcio/govie-services-messaging/issues/31615) ([#371](https://github.com/ogcio/govie-services-messaging/issues/371)) ([911a5df](https://github.com/ogcio/govie-services-messaging/commit/911a5df24559994f379f736d6a9db16bbe742f9a))
* e2e tests for citizen portal AB[#39551](https://github.com/ogcio/govie-services-messaging/issues/39551) ([#635](https://github.com/ogcio/govie-services-messaging/issues/635)) ([6628d37](https://github.com/ogcio/govie-services-messaging/commit/6628d37c8c26ce126fd4d80970a86129181c66d4))
* e2e tests updated for profile-next and dashboard-next AB[#38022](https://github.com/ogcio/govie-services-messaging/issues/38022) ([#563](https://github.com/ogcio/govie-services-messaging/issues/563)) ([4abbd75](https://github.com/ogcio/govie-services-messaging/commit/4abbd7513fdedeaaa0d7aa531b2c1e1202792e10))
* extend backfill logging AB[#40032](https://github.com/ogcio/govie-services-messaging/issues/40032) ([#677](https://github.com/ogcio/govie-services-messaging/issues/677)) ([f000322](https://github.com/ogcio/govie-services-messaging/commit/f00032222663e660f5183dc2e23efdeaccdbb50e))
* fix visual tests AB[#40458](https://github.com/ogcio/govie-services-messaging/issues/40458) ([#711](https://github.com/ogcio/govie-services-messaging/issues/711)) ([1fcd6e2](https://github.com/ogcio/govie-services-messaging/commit/1fcd6e28c55f0870d063bc8902f4a19f9d5d702e))
* healthcheck and ready AB[#39772](https://github.com/ogcio/govie-services-messaging/issues/39772) ([#651](https://github.com/ogcio/govie-services-messaging/issues/651)) ([4d6b05e](https://github.com/ogcio/govie-services-messaging/commit/4d6b05e838f4b8ccfb20536a8bdca04526076c92))
* improve logging AB[#38766](https://github.com/ogcio/govie-services-messaging/issues/38766) ([#585](https://github.com/ogcio/govie-services-messaging/issues/585)) ([4bfd900](https://github.com/ogcio/govie-services-messaging/commit/4bfd900a01787eb40aaed4b229f9875621f9c4ed))
* **messaging-api:** remove sentry AB[#35169](https://github.com/ogcio/govie-services-messaging/issues/35169) ([#291](https://github.com/ogcio/govie-services-messaging/issues/291)) ([8dc7daf](https://github.com/ogcio/govie-services-messaging/commit/8dc7dafca23970475993420ddd37659c2320a412))
* o11y as plugin ([#476](https://github.com/ogcio/govie-services-messaging/issues/476)) ([bc56709](https://github.com/ogcio/govie-services-messaging/commit/bc5670967de5dc5ebad64f82ac450cff805b5119))
* readded o11y with false error tracing ([#471](https://github.com/ogcio/govie-services-messaging/issues/471)) ([e64486c](https://github.com/ogcio/govie-services-messaging/commit/e64486cf63874f0e8e6a063f25dbf340bc50ba0d))
* remove legacy Next.js 14 apps (messaging, messaging-admin) AB[#39960](https://github.com/ogcio/govie-services-messaging/issues/39960) ([#690](https://github.com/ogcio/govie-services-messaging/issues/690)) ([e2bcc08](https://github.com/ogcio/govie-services-messaging/commit/e2bcc0875c4f51505db2069dda6d877845d29751))
* review backfill payload data AB[#40032](https://github.com/ogcio/govie-services-messaging/issues/40032) ([#666](https://github.com/ogcio/govie-services-messaging/issues/666)) ([982b771](https://github.com/ogcio/govie-services-messaging/commit/982b7718daa52b2b03c7b0a5c914df9c05d7694c))
* switch tests to messaging next app AB[#37398](https://github.com/ogcio/govie-services-messaging/issues/37398) ([#534](https://github.com/ogcio/govie-services-messaging/issues/534)) ([c09dbad](https://github.com/ogcio/govie-services-messaging/commit/c09dbad073f64db615c3e1059218c7ff2b682264))
* update deps AB[#38540](https://github.com/ogcio/govie-services-messaging/issues/38540) ([#592](https://github.com/ogcio/govie-services-messaging/issues/592)) ([32c6e7a](https://github.com/ogcio/govie-services-messaging/commit/32c6e7afea40cdbc1dd1ef4467c00dc272349370))
* update deps AB[#40300](https://github.com/ogcio/govie-services-messaging/issues/40300) ([#710](https://github.com/ogcio/govie-services-messaging/issues/710)) ([371a74c](https://github.com/ogcio/govie-services-messaging/commit/371a74c73bd92fce531bd84355ec8eae86653c67))
* updated deps AB[#36811](https://github.com/ogcio/govie-services-messaging/issues/36811) ([#443](https://github.com/ogcio/govie-services-messaging/issues/443)) ([183a639](https://github.com/ogcio/govie-services-messaging/commit/183a6398843ccc4989c302447dcfb119c84f0699))
* updated deps AB[#37001](https://github.com/ogcio/govie-services-messaging/issues/37001) ([#494](https://github.com/ogcio/govie-services-messaging/issues/494)) ([328331b](https://github.com/ogcio/govie-services-messaging/commit/328331b7310de013bd3d502daa8bc85d832ba884))
* updated deps AB[#37001](https://github.com/ogcio/govie-services-messaging/issues/37001) ([#516](https://github.com/ogcio/govie-services-messaging/issues/516)) ([41bf843](https://github.com/ogcio/govie-services-messaging/commit/41bf8438d95048bf144feb913f4bf5cd39015cd8))
* updated deps AB[#38540](https://github.com/ogcio/govie-services-messaging/issues/38540) ([#608](https://github.com/ogcio/govie-services-messaging/issues/608)) ([630b89a](https://github.com/ogcio/govie-services-messaging/commit/630b89adeef3fa79f7f3cf39f372e6856ff88964))
* updated logger to 5.3.0 AB[#32559](https://github.com/ogcio/govie-services-messaging/issues/32559) ([#182](https://github.com/ogcio/govie-services-messaging/issues/182)) ([95bdb14](https://github.com/ogcio/govie-services-messaging/commit/95bdb14eed297a37e721cc6fa47dc70c3a99d531))
* updated messaging-api deps AB[#35970](https://github.com/ogcio/govie-services-messaging/issues/35970) ([#382](https://github.com/ogcio/govie-services-messaging/issues/382)) ([7cd34c1](https://github.com/ogcio/govie-services-messaging/commit/7cd34c1781a3c61610c625ff4ff0456f8109a00d))
* use custom logto backfill env var AB[#40032](https://github.com/ogcio/govie-services-messaging/issues/40032) ([#699](https://github.com/ogcio/govie-services-messaging/issues/699)) ([74d1a3c](https://github.com/ogcio/govie-services-messaging/commit/74d1a3c977d0c5ddb03fa1689615b56e5e62171d))
