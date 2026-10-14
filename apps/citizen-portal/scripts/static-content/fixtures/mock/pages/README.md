# Mock pages

One Wagtail API v2 page per file, in `en/<id>.json` and `ga/<id>.json`. A GA
page shares its EN page's ID; `translation_of=<id>&locale=ga` returns it.

Page tree (ID, slug):

```
1000  life-events
├── 1101  birth-of-a-child
├── 1102  child-adoption
├── 1103  become-an-adult
├── 1104  child-starting-school
│   ├── 1201  apply-for-a-school-place
│   ├── 1202  apply-for-the-school-transport-scheme
│   ├── 1203  apply-for-the-back-to-school-clothing-and-footwear-allowance
│   ├── 1204  request-an-assessment-of-special-educational-needs
│   └── 1205  appeal-a-refusal-of-admission
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
