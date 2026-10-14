# Changelog

## [0.1.2](https://github.com/ogcio/govie-services-messaging/compare/public-servant-portal-v0.1.1...public-servant-portal-v0.1.2) (2026-10-13)


### Bug Fixes

* skip chunk-load log while reload recovers AB[#44481](https://github.com/ogcio/govie-services-messaging/issues/44481) ([#1035](https://github.com/ogcio/govie-services-messaging/issues/1035)) ([bfae994](https://github.com/ogcio/govie-services-messaging/commit/bfae9947c68ebf2cadd4173bde492d0b719c0e1c))

## [0.1.1](https://github.com/ogcio/govie-services-messaging/compare/public-servant-portal-v0.1.0...public-servant-portal-v0.1.1) (2026-10-12)


### Features

* **messaging-api:** adopt @ogcio/db-core Kysely layer AB[#41141](https://github.com/ogcio/govie-services-messaging/issues/41141) ([#768](https://github.com/ogcio/govie-services-messaging/issues/768)) ([5a210d4](https://github.com/ogcio/govie-services-messaging/commit/5a210d41fdab1d2d38de9607e46dece06d4069c5))
* **public-servant-portal:** consolidate admin apps AB[#41525](https://github.com/ogcio/govie-services-messaging/issues/41525) ([#834](https://github.com/ogcio/govie-services-messaging/issues/834)) ([0af2b56](https://github.com/ogcio/govie-services-messaging/commit/0af2b562d331744f4988eab404d934a04b051525))


### Bug Fixes

* **deps:** pin @opentelemetry/core for GHSA-8988-4f7v-96qf AB[#42306](https://github.com/ogcio/govie-services-messaging/issues/42306) ([#870](https://github.com/ogcio/govie-services-messaging/issues/870)) ([5fe3e09](https://github.com/ogcio/govie-services-messaging/commit/5fe3e09069ce47eda40ee76bd0e09fc70569e8fc))
* **deps:** update all non-major dependencies ([#1002](https://github.com/ogcio/govie-services-messaging/issues/1002)) ([4e80277](https://github.com/ogcio/govie-services-messaging/commit/4e8027747450fe0fdc816be9cd249e2a56d2a08c))
* **deps:** update all non-major dependencies ([#1024](https://github.com/ogcio/govie-services-messaging/issues/1024)) ([75e7079](https://github.com/ogcio/govie-services-messaging/commit/75e70792a4c88eea9db9e7be7196c8c166f2ba1b))
* **deps:** update all non-major dependencies ([#869](https://github.com/ogcio/govie-services-messaging/issues/869)) ([680dc92](https://github.com/ogcio/govie-services-messaging/commit/680dc9212263e5da43fb6925b949564e86451ca7))
* **deps:** update all non-major dependencies ([#930](https://github.com/ogcio/govie-services-messaging/issues/930)) ([b4856b9](https://github.com/ogcio/govie-services-messaging/commit/b4856b9464d10c577b5666322980e8f556e8b635))
* **deps:** update all non-major dependencies ([#952](https://github.com/ogcio/govie-services-messaging/issues/952)) ([70671c4](https://github.com/ogcio/govie-services-messaging/commit/70671c43f22f78463032a20e968c5fed50a84673))
* **deps:** update all non-major dependencies ([#974](https://github.com/ogcio/govie-services-messaging/issues/974)) ([d16ccbb](https://github.com/ogcio/govie-services-messaging/commit/d16ccbbc84b6ce9c4f9aada3830f1cfb88a3fed2))
* design system selector update AB[#42958](https://github.com/ogcio/govie-services-messaging/issues/42958) ([#929](https://github.com/ogcio/govie-services-messaging/issues/929)) ([1580dae](https://github.com/ogcio/govie-services-messaging/commit/1580daef0ffad185aaea9067a81c103d01fc380a))
* ignore Go stdlib CVEs blocking upload-api Trivy/grype scans AB[#41977](https://github.com/ogcio/govie-services-messaging/issues/41977) ([#829](https://github.com/ogcio/govie-services-messaging/issues/829)) ([582ca5e](https://github.com/ogcio/govie-services-messaging/commit/582ca5eea9d0f794779a53efc6942f44752f2065))
* keep visual snapshots stable when lists grow AB[#44173](https://github.com/ogcio/govie-services-messaging/issues/44173) ([#1007](https://github.com/ogcio/govie-services-messaging/issues/1007)) ([7c5d16c](https://github.com/ogcio/govie-services-messaging/commit/7c5d16ceb42ed4efb863e4b326a6d678128e7cdc))
* open the signed-in profile from the admin menu AB[#43928](https://github.com/ogcio/govie-services-messaging/issues/43928) ([#984](https://github.com/ogcio/govie-services-messaging/issues/984)) ([1182c85](https://github.com/ogcio/govie-services-messaging/commit/1182c852c60a36c7b4d63290d7e17e60e95e24c5))
* pin Faro 2.11 until Alloy CORS allows Idempotency-Key AB[#43698](https://github.com/ogcio/govie-services-messaging/issues/43698) ([#971](https://github.com/ogcio/govie-services-messaging/issues/971)) ([84c725c](https://github.com/ogcio/govie-services-messaging/commit/84c725cdbd383cd356479a0a3b203ed0e804e6af))
* **public-servant-portal:** anchor service user tab navigation AB[#43284](https://github.com/ogcio/govie-services-messaging/issues/43284) ([#970](https://github.com/ogcio/govie-services-messaging/issues/970)) ([8609722](https://github.com/ogcio/govie-services-messaging/commit/8609722bb38394a56101d56d465398aa37fe6f1c))
* **public-servant-portal:** bound service user upload tests AB[#43284](https://github.com/ogcio/govie-services-messaging/issues/43284) ([#973](https://github.com/ogcio/govie-services-messaging/issues/973)) ([b68dbb3](https://github.com/ogcio/govie-services-messaging/commit/b68dbb3fbb868b2f10427645f2ed32fa29112239))
* **public-servant-portal:** eliminate service user tab navigation AB[#43284](https://github.com/ogcio/govie-services-messaging/issues/43284) ([#972](https://github.com/ogcio/govie-services-messaging/issues/972)) ([8fc516a](https://github.com/ogcio/govie-services-messaging/commit/8fc516ab041cc128200cfcf3ca15f0e987ceee94))
* **public-servant-portal:** serve router payloads AB[#43284](https://github.com/ogcio/govie-services-messaging/issues/43284) ([#969](https://github.com/ogcio/govie-services-messaging/issues/969)) ([e7a184c](https://github.com/ogcio/govie-services-messaging/commit/e7a184c9792caa149d34f936f718a762ea349d09))
* **public-servant-portal:** stabilize service user tabs AB[#43284](https://github.com/ogcio/govie-services-messaging/issues/43284) ([#965](https://github.com/ogcio/govie-services-messaging/issues/965)) ([257de9d](https://github.com/ogcio/govie-services-messaging/commit/257de9d5b0db9203ff48ad6a1cea698702161e07))
* re-resolve nginx proxy upstreams AB[#44041](https://github.com/ogcio/govie-services-messaging/issues/44041) ([#992](https://github.com/ogcio/govie-services-messaging/issues/992)) ([44dae26](https://github.com/ogcio/govie-services-messaging/commit/44dae265c56300d5274935e7df779067f5e376f4))
* repair nodemailer v10 and vitest v5 migrations AB[#42774](https://github.com/ogcio/govie-services-messaging/issues/42774) ([#903](https://github.com/ogcio/govie-services-messaging/issues/903)) ([6d29a4a](https://github.com/ogcio/govie-services-messaging/commit/6d29a4a25104912cf150bf1ce4ba02f5ecb8f802))
* scope portal organization selection by app AB[#43281](https://github.com/ogcio/govie-services-messaging/issues/43281) ([#961](https://github.com/ogcio/govie-services-messaging/issues/961)) ([1e7f406](https://github.com/ogcio/govie-services-messaging/commit/1e7f406b45299ee6dd2c86f97d4a5a40c3893628))
* stop reliability bugs from leaking as unhandled errors AB[#42306](https://github.com/ogcio/govie-services-messaging/issues/42306) ([#884](https://github.com/ogcio/govie-services-messaging/issues/884)) ([e639509](https://github.com/ogcio/govie-services-messaging/commit/e639509b8ddbd9b5984af23decbf291e4d6cabbb))
* wait for profile-admin chrome before visual snapshots AB[#42808](https://github.com/ogcio/govie-services-messaging/issues/42808) ([#907](https://github.com/ogcio/govie-services-messaging/issues/907)) ([2611daa](https://github.com/ogcio/govie-services-messaging/commit/2611daa2af58139310590b46e22cab2bcfb57e27))


### Miscellaneous Chores

* bump sag-client to 0.8.2 AB[#43504](https://github.com/ogcio/govie-services-messaging/issues/43504) ([#968](https://github.com/ogcio/govie-services-messaging/issues/968)) ([bf62420](https://github.com/ogcio/govie-services-messaging/commit/bf62420e770a7e881d3ef7e2321023d6c7ba7110))
* **deps:** bump @ogcio/sag-client to 0.7.11 AB[#42515](https://github.com/ogcio/govie-services-messaging/issues/42515) ([#896](https://github.com/ogcio/govie-services-messaging/issues/896)) ([2d50257](https://github.com/ogcio/govie-services-messaging/commit/2d5025745609fb107b35db17020dc0e14d926ae4))
* **deps:** update @ogcio/design-system-react to 1.42.0 AB[#42958](https://github.com/ogcio/govie-services-messaging/issues/42958) ([#924](https://github.com/ogcio/govie-services-messaging/issues/924)) ([b19ed22](https://github.com/ogcio/govie-services-messaging/commit/b19ed22f5d8f68946d11aa2f1022bfeec57ba1a7))
* **deps:** update dependency @testing-library/jest-dom to v7 ([#821](https://github.com/ogcio/govie-services-messaging/issues/821)) ([7318f71](https://github.com/ogcio/govie-services-messaging/commit/7318f7174633ba0c67e586b7e5da3c70b37bf311))
* **deps:** update dependency jsdom to v30 ([#823](https://github.com/ogcio/govie-services-messaging/issues/823)) ([96adc68](https://github.com/ogcio/govie-services-messaging/commit/96adc6821f5f07b385963e67c3c1f9301083fb3c))
* **deps:** update vitest monorepo to v5 (major) ([#899](https://github.com/ogcio/govie-services-messaging/issues/899)) ([5da3cfe](https://github.com/ogcio/govie-services-messaging/commit/5da3cfefc5803c9651aaa33c75fec60c91b1cad9))
* Fix citizen portal tests AB[#42515](https://github.com/ogcio/govie-services-messaging/issues/42515) ([#894](https://github.com/ogcio/govie-services-messaging/issues/894)) ([0c950d5](https://github.com/ogcio/govie-services-messaging/commit/0c950d5c8ab5a90e3f918939a906874ca506a96e))
* update admin event log visual snapshot AB[#42958](https://github.com/ogcio/govie-services-messaging/issues/42958) ([#940](https://github.com/ogcio/govie-services-messaging/issues/940)) ([ea4fed9](https://github.com/ogcio/govie-services-messaging/commit/ea4fed9a8fac15f1285002cebd5f03b7b4943004))
* update deps AB[#44227](https://github.com/ogcio/govie-services-messaging/issues/44227) ([#1019](https://github.com/ogcio/govie-services-messaging/issues/1019)) ([9fc95bf](https://github.com/ogcio/govie-services-messaging/commit/9fc95bf8f2d4386d28f683c802bd57c5d59322f9))
* update rds certificates AB[#43420](https://github.com/ogcio/govie-services-messaging/issues/43420) ([#985](https://github.com/ogcio/govie-services-messaging/issues/985)) ([b23a21b](https://github.com/ogcio/govie-services-messaging/commit/b23a21b01fa10bb704b504339e28847265904db5))

## [0.1.2](https://github.com/ogcio/govie-services-messaging/compare/messaging-admin-next-v0.1.1...messaging-admin-next-v0.1.2) (2026-08-05)


### Features

* change attachments size limit to 3x5mb AB[#37833](https://github.com/ogcio/govie-services-messaging/issues/37833) ([#759](https://github.com/ogcio/govie-services-messaging/issues/759)) ([fa00f62](https://github.com/ogcio/govie-services-messaging/commit/fa00f62d6b950d16b032b92ae6056ab66bab2539))
* improve metrics AB[#40868](https://github.com/ogcio/govie-services-messaging/issues/40868) ([#727](https://github.com/ogcio/govie-services-messaging/issues/727)) ([a3372df](https://github.com/ogcio/govie-services-messaging/commit/a3372df5297ea9c6a5f31bd7671130f79df49246))


### Bug Fixes

* **admin:** persist selected organisation across logout AB[#28623](https://github.com/ogcio/govie-services-messaging/issues/28623) ([#761](https://github.com/ogcio/govie-services-messaging/issues/761)) ([3539547](https://github.com/ogcio/govie-services-messaging/commit/353954787e15bfaaebc265f0fe981582a447ef1e))
* **deps:** patch high-severity image-scan CVEs in api/support images AB[#40683](https://github.com/ogcio/govie-services-messaging/issues/40683) ([#758](https://github.com/ogcio/govie-services-messaging/issues/758)) ([b35e897](https://github.com/ogcio/govie-services-messaging/commit/b35e897a7e15877030853ea3bd73100cfe2a03bf))
* event log order and align schedule date AB[#28388](https://github.com/ogcio/govie-services-messaging/issues/28388) ([#798](https://github.com/ogcio/govie-services-messaging/issues/798)) ([e5d0286](https://github.com/ogcio/govie-services-messaging/commit/e5d02866e42d30f127dd9959f417f103f4c24a9b))

## [0.1.1](https://github.com/ogcio/govie-services-messaging/compare/messaging-admin-next-v0.1.0...messaging-admin-next-v0.1.1) (2026-07-22)


### Features

* **AB#37462:** add messaging-admin-next Next.js 16 static export admin app ([#567](https://github.com/ogcio/govie-services-messaging/issues/567)) ([57b2d75](https://github.com/ogcio/govie-services-messaging/commit/57b2d7580386493ae8a835a12eab71836e8ea55c))
* **AB#39014:** fix template search freeze and improve search performance ([#599](https://github.com/ogcio/govie-services-messaging/issues/599)) ([791e0d4](https://github.com/ogcio/govie-services-messaging/commit/791e0d4ce7169aa9eecc0503c7ad8e8e8228c435))
* proxy Unleash to avoid client-side blocking AB[#39949](https://github.com/ogcio/govie-services-messaging/issues/39949) ([#654](https://github.com/ogcio/govie-services-messaging/issues/654)) ([8054ce0](https://github.com/ogcio/govie-services-messaging/commit/8054ce009d9f6d329c0102641bbaf62c4309889f))


### Bug Fixes

* **AB#39003:** fix attachment sending in messaging-admin-next ([#600](https://github.com/ogcio/govie-services-messaging/issues/600)) ([1cd4ae2](https://github.com/ogcio/govie-services-messaging/commit/1cd4ae28da1e843f0139df49aa5becaa29206ed6))
* **AB#39014:** fix template search Enter freeze via URL-driven search ([#611](https://github.com/ogcio/govie-services-messaging/issues/611)) ([0541614](https://github.com/ogcio/govie-services-messaging/commit/05416143c5c3d1ebc871b4df56ca70af02d7043b))
* **deps:** update all non-major dependencies ([#702](https://github.com/ogcio/govie-services-messaging/issues/702)) ([9eeec8a](https://github.com/ogcio/govie-services-messaging/commit/9eeec8a5c5145da591c79f8822add98b019f3610))
* derive menu link locale from URL path AB[#40314](https://github.com/ogcio/govie-services-messaging/issues/40314) ([#683](https://github.com/ogcio/govie-services-messaging/issues/683)) ([7a2114c](https://github.com/ogcio/govie-services-messaging/commit/7a2114cb249fa2df5dcfed2c44b1faeb52eed6f8))
* **messaging-admin-next:** add missing ga email providers empty-state translation AB[#38952](https://github.com/ogcio/govie-services-messaging/issues/38952) ([#594](https://github.com/ogcio/govie-services-messaging/issues/594)) ([ef7b09d](https://github.com/ogcio/govie-services-messaging/commit/ef7b09d920465738ef5cb770d7939341cb7d2959))
* **messaging-admin-next:** default admin sign-in to EntraID connector AB[#38524](https://github.com/ogcio/govie-services-messaging/issues/38524) ([#575](https://github.com/ogcio/govie-services-messaging/issues/575)) ([ba70ab6](https://github.com/ogcio/govie-services-messaging/commit/ba70ab66bdfe6bb0cfe0df564766b37fa4ff617d))
* **messaging-admin-next:** drop directSignIn, scope Logto chooser to EntraID AB[#38524](https://github.com/ogcio/govie-services-messaging/issues/38524) ([#577](https://github.com/ogcio/govie-services-messaging/issues/577)) ([07388d1](https://github.com/ogcio/govie-services-messaging/commit/07388d159351f93b91518781d65f1488eaea6825))
* **messaging-admin-next:** persist organisation switch in admin user menu AB[#38950](https://github.com/ogcio/govie-services-messaging/issues/38950) ([#593](https://github.com/ogcio/govie-services-messaging/issues/593)) ([2ccba50](https://github.com/ogcio/govie-services-messaging/commit/2ccba5072861aecc38a7a96639509d2fae387ddf))
* **messaging-admin-next:** stop /en/send-a-message reload loop blocking recipient add AB[#38812](https://github.com/ogcio/govie-services-messaging/issues/38812) ([#587](https://github.com/ogcio/govie-services-messaging/issues/587)) ([717b0eb](https://github.com/ogcio/govie-services-messaging/commit/717b0eb8df0b67ce4f0d0bda567030bb43bff99b))
* **messaging-admin-next:** unwrap client.fetch response once in add-recipient flow AB[#38812](https://github.com/ogcio/govie-services-messaging/issues/38812) ([#590](https://github.com/ogcio/govie-services-messaging/issues/590)) ([332c4d5](https://github.com/ogcio/govie-services-messaging/commit/332c4d5567accf8046365cff069dbef93d93070a))
* nginx otel config AB[#39971](https://github.com/ogcio/govie-services-messaging/issues/39971) ([#657](https://github.com/ogcio/govie-services-messaging/issues/657)) ([5c391a5](https://github.com/ogcio/govie-services-messaging/commit/5c391a5ebc8d3ecabbdff9986cc98f47fa5d65c2))
* nginx otel config AB[#39971](https://github.com/ogcio/govie-services-messaging/issues/39971) ([#658](https://github.com/ogcio/govie-services-messaging/issues/658)) ([e3f5b8a](https://github.com/ogcio/govie-services-messaging/commit/e3f5b8a13dc8b76b106fb4096e873d799894d079))
* otel config AB[#39971](https://github.com/ogcio/govie-services-messaging/issues/39971) ([#663](https://github.com/ogcio/govie-services-messaging/issues/663)) ([116e7f0](https://github.com/ogcio/govie-services-messaging/commit/116e7f043d88f6721f379c2496ae30f8aefe3ae9))
* override consent scope AB[#38717](https://github.com/ogcio/govie-services-messaging/issues/38717) ([#649](https://github.com/ogcio/govie-services-messaging/issues/649)) ([3c22eef](https://github.com/ogcio/govie-services-messaging/commit/3c22eef5d3e07db7cf6da75d1a3d4538a5103da6))
* preserve language preference across apps AB[#40314](https://github.com/ogcio/govie-services-messaging/issues/40314) ([#676](https://github.com/ogcio/govie-services-messaging/issues/676)) ([6285ec7](https://github.com/ogcio/govie-services-messaging/commit/6285ec7e65633ef0b7ef19327e687beba043ffb6))
* render layout and logout on messaging-admin unauthorized page AB[#40066](https://github.com/ogcio/govie-services-messaging/issues/40066) ([#668](https://github.com/ogcio/govie-services-messaging/issues/668)) ([3753615](https://github.com/ogcio/govie-services-messaging/commit/3753615bc1c7d2c69e997453be8b76c64d061a47))
* update nginx version AB[#40300](https://github.com/ogcio/govie-services-messaging/issues/40300) ([#692](https://github.com/ogcio/govie-services-messaging/issues/692)) ([84a0870](https://github.com/ogcio/govie-services-messaging/commit/84a08705261064048416cf1876498432303eedd9))


### Miscellaneous Chores

* a11y reports in e2e tests AB[#39383](https://github.com/ogcio/govie-services-messaging/issues/39383) ([#742](https://github.com/ogcio/govie-services-messaging/issues/742)) ([ba49473](https://github.com/ogcio/govie-services-messaging/commit/ba49473b01ba3c18d29b513b0a0df8e865e68e72))
* bump @ogcio/sag-client to 0.7.3 AB[#00001](https://github.com/ogcio/govie-services-messaging/issues/00001) ([#602](https://github.com/ogcio/govie-services-messaging/issues/602)) ([5e62c17](https://github.com/ogcio/govie-services-messaging/commit/5e62c175648a68850be5c56c1609785e640ba2a2))
* **messaging-next:** increase logging for attachment download AB[#40343](https://github.com/ogcio/govie-services-messaging/issues/40343) ([#679](https://github.com/ogcio/govie-services-messaging/issues/679)) ([7260475](https://github.com/ogcio/govie-services-messaging/commit/7260475a1f34fd48141467a806aeda9737b692c4))
* remove dashboard-admin links and e2e tests AB[#38801](https://github.com/ogcio/govie-services-messaging/issues/38801) ([#591](https://github.com/ogcio/govie-services-messaging/issues/591)) ([ebe523f](https://github.com/ogcio/govie-services-messaging/commit/ebe523f3e080349e0346fc0c08794b5befc28aa5))
* Update admin tests AB[#38364](https://github.com/ogcio/govie-services-messaging/issues/38364) ([#616](https://github.com/ogcio/govie-services-messaging/issues/616)) ([39336bd](https://github.com/ogcio/govie-services-messaging/commit/39336bd488aef6fbfdbbcfb2a1c757b471337116))
* update deps AB[#38540](https://github.com/ogcio/govie-services-messaging/issues/38540) ([#592](https://github.com/ogcio/govie-services-messaging/issues/592)) ([32c6e7a](https://github.com/ogcio/govie-services-messaging/commit/32c6e7afea40cdbc1dd1ef4467c00dc272349370))
* update deps AB[#40300](https://github.com/ogcio/govie-services-messaging/issues/40300) ([#710](https://github.com/ogcio/govie-services-messaging/issues/710)) ([371a74c](https://github.com/ogcio/govie-services-messaging/commit/371a74c73bd92fce531bd84355ec8eae86653c67))
* updated deps AB[#38540](https://github.com/ogcio/govie-services-messaging/issues/38540) ([#608](https://github.com/ogcio/govie-services-messaging/issues/608)) ([630b89a](https://github.com/ogcio/govie-services-messaging/commit/630b89adeef3fa79f7f3cf39f372e6856ff88964))
