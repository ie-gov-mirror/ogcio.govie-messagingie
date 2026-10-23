# Mock pages

One Integration API page per file, in `en/<id>.json` and `ga/<id>.json`, as
`GET /v2/pages/<id>/` returns it. GA pages have their own IDs, as in the CMS:
the EN ID plus 1000. The API doesn't say which page a translation belongs
to, so each GA page names its EN page in `_translation_of`, which the mock
transport answers `translation_of` with and leaves out of responses.

Page tree (EN ID, slug):

```
1000  life-events
├── 1101  birth-of-a-child
├── 1102  child-adoption
├── 1103  become-an-adult
├── 1104  child-starting-school   (5 services, 2 guidance links)
├── 1105  transition-from-secondary-to-tertiary-education
├── 1106  owning-driving-a-vehicle
├── 1107  accessing-social-housing
├── 1108  moving-home
├── 1109  buying-or-renting
├── 1110  finding-and-maintaining-a-home
├── 1111  starting-work
├── 1112  losing-a-job
├── 1113  starting-a-business
├── 1114  marriage
├── 1115  civil-partnership
├── 1116  marriage-dissolution-separation-divorce
├── 1117  developing-a-life-altering-illness
├── 1118  becoming-a-carer
├── 1119  retirement
├── 1120  pension
└── 1121  supporting-the-bereaved-death-of-a-loved-one
```
