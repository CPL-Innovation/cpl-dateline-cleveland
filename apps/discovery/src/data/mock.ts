// Hand-authored mock, ported verbatim from the Claude Design converged prototype
// (Dateline Cleveland - Prototype.dc.html). Calendar = one populated week
// (Jul 23–29 1970, Cleveland Scene material); Index = 12 objects (1924–1970).
// Facet counts and source credits are plausible fabrications — flagged in-UI.

import type {
  CalendarSection,
  Dataset,
  FacetGroup,
  IndexItem,
  WeekCell,
} from '../lib/types';
import { buildSections } from '../lib/calendar';

const weeks: WeekCell[] = [
  { year: '1924', sub: 'FEB 1–7', hasData: false },
  { year: '1936', sub: 'JUN 11–17', hasData: false },
  { year: '1948', sub: 'OCT 7–13', hasData: false },
  { year: '1962', sub: 'MAY 3–9', hasData: false },
  { year: '1970', sub: 'JUL 23–29', hasData: true },
  { year: '1974', sub: 'AUG 15–21', hasData: false },
];

// Authoring convenience: events grouped for readability. The real display sections
// are DERIVED from each event's event_type below (buildSections) — SLICE-04.
const mockGrouped: CalendarSection[] = [
  {
    name: 'MUSIC',
    events: [
      {
        id: 'sly',
        eventType: 'concert',
        sourceKind: 'ad',
        stamp: 'PUBLIC AUDITORIUM · SAT JUL 25 · 8:30 PM',
        title: 'Sly & The Family Stone',
        blurb: 'One night only downtown — the whole family, "and a light show besides."',
        price: '$5.50 / $4.50 / $3.50 — as printed',
        section: 'MUSIC · FROM A DISPLAY AD',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 12 · COL 2–4',
        clipNote: 'Quarter-page display ad, Public Auditorium',
        transcript:
          'BELKIN PRODUCTIONS PRESENTS — SLY AND THE FAMILY STONE — in person — PUBLIC AUDITORIUM, Sat. July 25, 8:30 p.m. All seats reserved: $5.50, $4.50, $3.50. Tickets at Burrows, all Disc Records stores, and the Auditorium box office. [illegible] … and a light show besides.',
        facts: [
          { label: 'PERFORMER', value: 'Sly & The Family Stone' },
          { label: 'VENUE', value: 'Public Auditorium, E. 6th & Lakeside' },
          { label: 'DATE / TIME', value: 'Saturday, July 25 1970 · 8:30 PM' },
          { label: 'PRICE AS PRINTED', value: '$5.50 / $4.50 / $3.50, reserved' },
          { label: 'PROMOTER', value: 'Belkin Productions' },
          { label: 'EXTRACTED FROM', value: 'Display advertisement, p. 12' },
        ],
      },
      {
        id: 'mathis',
        eventType: 'concert',
        sourceKind: 'listing',
        stamp: 'BLOSSOM MUSIC CENTER · TUE JUL 28 · 8:30 PM',
        title: 'Johnny Mathis at Blossom',
        blurb: 'Under the pavilion with the Cleveland Orchestra pops — lawn seats a dollar.',
        price: 'Pavilion $6.00 · lawn $1.00 — as printed',
        section: 'MUSIC · FROM A SEASON LISTING',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 9 · COL 1',
        clipNote: 'Blossom summer season listing block',
        transcript:
          'BLOSSOM MUSIC CENTER — Tues. July 28: JOHNNY MATHIS with orchestra, 8:30. Pavilion $6.00, lawn $1.00. Coming: [loss] Aug. 2. Route 271 to Route 8, follow the signs.',
        facts: [
          { label: 'PERFORMER', value: 'Johnny Mathis' },
          { label: 'VENUE', value: 'Blossom Music Center, Cuyahoga Falls' },
          { label: 'DATE / TIME', value: 'Tuesday, July 28 1970 · 8:30 PM' },
          { label: 'PRICE AS PRINTED', value: 'Pavilion $6.00 · lawn $1.00' },
          { label: 'EXTRACTED FROM', value: 'Season listing, p. 9' },
        ],
      },
      {
        id: 'agora',
        eventType: 'concert',
        sourceKind: 'listing',
        stamp: 'THE AGORA, E. 24TH ST · ALL WEEK · 9 PM',
        title: 'Damnation of Adam Blessing',
        blurb: 'The hometown heavies hold the club through Wednesday; no cover Monday.',
        price: 'Cover $1.50 · Mon free — as printed',
        section: 'MUSIC · FROM A CLUB LISTING',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 14 · COL 3',
        clipNote: 'Club engagements column',
        transcript:
          'THE AGORA, 2175 Cornell — thru Wed.: DAMNATION OF ADAM BLESSING. Cover $1.50, Mondays free. Thurs.–Sat.: [illegible] Blues Band. Proof of age required.',
        facts: [
          { label: 'PERFORMER', value: 'Damnation of Adam Blessing' },
          { label: 'VENUE', value: 'The Agora, 2175 Cornell Rd' },
          { label: 'DATE / TIME', value: 'Through Wed, Jul 29 1970 · 9 PM' },
          { label: 'PRICE AS PRINTED', value: 'Cover $1.50 · Mondays free' },
          { label: 'EXTRACTED FROM', value: 'Club listings column, p. 14' },
        ],
      },
    ],
  },
  {
    name: 'FILM',
    events: [
      {
        id: 'woodstock',
        eventType: 'film',
        sourceKind: 'ad',
        stamp: 'HIPPODROME, EUCLID AVE · DAILY · 4 SHOWS',
        title: '“Woodstock” — held over',
        blurb: '“Three days of peace & music,” fifth big week downtown.',
        price: 'Adults $2.50 · eve $3.00 — as printed',
        section: 'FILM · FROM A DISPLAY AD',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 16 · COL 1–2',
        clipNote: 'Two-column film display ad',
        transcript:
          'NOW — 5th BIG WEEK! WOODSTOCK — 3 days of peace, music … and love. Hippodrome, Euclid at E. 7th. Daily 12:30, 3:45, 7:00, 10:10. Adults $2.50 matinee, $3.00 eves. No one under [illegible] admitted without parent.',
        facts: [
          { label: 'TITLE', value: '“Woodstock” (1970)' },
          { label: 'VENUE', value: 'Hippodrome Theatre, Euclid Ave' },
          { label: 'DATE / TIME', value: 'Daily · 12:30, 3:45, 7:00, 10:10' },
          { label: 'PRICE AS PRINTED', value: '$2.50 matinee · $3.00 evenings' },
          { label: 'EXTRACTED FROM', value: 'Display advertisement, p. 16' },
        ],
      },
      {
        id: 'mayfield',
        eventType: 'film',
        sourceKind: 'ad',
        stamp: 'OLD MAYFIELD, COVENTRY · FRI–SUN',
        title: 'Old Mayfield film calendar',
        blurb: 'The repertory house runs “Z”, then a Marx Brothers double bill Sunday.',
        price: '$1.25 all seats — as printed',
        section: 'FILM · FROM A CALENDAR AD',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 17 · COL 4',
        clipNote: 'Repertory calendar ad, Old Mayfield',
        transcript:
          'OLD MAYFIELD, Coventry at Mayfield — Fri.–Sat.: “Z” (7:30, 9:45). Sun.: DUCK SOUP / A NIGHT AT THE OPERA, from 6:00. All seats $1.25. Free parking rear. [loss]',
        facts: [
          { label: 'PROGRAM', value: '“Z” · Marx Bros. double bill' },
          { label: 'VENUE', value: 'Old Mayfield Theatre, Cleveland Hts' },
          { label: 'DATE / TIME', value: 'Fri Jul 24 – Sun Jul 26 1970' },
          { label: 'PRICE AS PRINTED', value: '$1.25 all seats' },
          { label: 'EXTRACTED FROM', value: 'Calendar advertisement, p. 17' },
        ],
      },
      {
        id: 'drivein',
        eventType: 'film',
        sourceKind: 'ad',
        stamp: 'MEMPHIS DRIVE-IN, BROOKLYN · NIGHTLY · DUSK',
        title: 'Drive-in triple feature',
        blurb: 'Three at dusk on Memphis Avenue; kids free in the back seat.',
        price: '$1.75 per person · kids free — as printed',
        section: 'FILM · FROM A DIRECTORY AD',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 17 · COL 1',
        clipNote: 'Drive-in directory listing',
        transcript:
          'MEMPHIS DRIVE-IN, Memphis Ave. at Fulton — nightly from dusk: 3 BIG HITS. [illegible] plus cartoon. $1.75 per person, children under 12 free. In-car heaters — no.',
        facts: [
          { label: 'PROGRAM', value: 'Triple feature (titles partly lost)' },
          { label: 'VENUE', value: 'Memphis Drive-In, Brooklyn' },
          { label: 'DATE / TIME', value: 'Nightly from dusk' },
          { label: 'PRICE AS PRINTED', value: '$1.75 · children under 12 free' },
          { label: 'EXTRACTED FROM', value: 'Directory listing, p. 17' },
        ],
      },
    ],
  },
  {
    name: 'THEATER',
    events: [
      {
        id: 'musicarnival',
        eventType: 'theater',
        sourceKind: 'ad',
        stamp: 'MUSICARNIVAL TENT · NIGHTLY EXC. MON · 8:40 PM',
        title: '“Fiddler on the Roof” in the round',
        blurb: 'The air-conditioned tent’s big summer musical, second week.',
        price: '$2.75 – $5.25 — as printed',
        section: 'THEATER · FROM A DISPLAY AD',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 15 · COL 2',
        clipNote: 'Tent-theater display ad',
        transcript:
          'MUSICARNIVAL, Warrensville Ctr. Rd. — 2nd week: FIDDLER ON THE ROOF, in the round, nightly except Mon., 8:40. Mats. Wed. & Sat. Seats $2.75–$5.25. Air conditioned. Phone area [illegible].',
        facts: [
          { label: 'PRODUCTION', value: '“Fiddler on the Roof”' },
          { label: 'VENUE', value: 'Musicarnival tent, Warrensville Hts' },
          { label: 'DATE / TIME', value: 'Nightly exc. Mon · 8:40 PM' },
          { label: 'PRICE AS PRINTED', value: '$2.75 – $5.25' },
          { label: 'EXTRACTED FROM', value: 'Display advertisement, p. 15' },
        ],
      },
      {
        id: 'cainpark',
        eventType: 'theater',
        sourceKind: 'ad',
        stamp: 'CAIN PARK, CLEVELAND HTS · FRI–SAT · 8:30 PM',
        title: 'Cain Park under the stars',
        blurb: 'The open-air amphitheater closes its July bill this weekend.',
        price: '$1.50 general — as printed',
        section: 'THEATER · FROM A NOTICE',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 15 · COL 4',
        clipNote: 'Community theater notice',
        transcript:
          'CAIN PARK THEATRE, Superior Rd. — final weekend of the July production, Fri. and Sat. at 8:30, weather permitting. General admission $1.50, students [loss].',
        facts: [
          { label: 'PRODUCTION', value: 'July production (title lost)' },
          { label: 'VENUE', value: 'Cain Park amphitheater' },
          { label: 'DATE / TIME', value: 'Fri Jul 24 – Sat Jul 25 · 8:30 PM' },
          { label: 'PRICE AS PRINTED', value: '$1.50 general' },
          { label: 'EXTRACTED FROM', value: 'Notice, p. 15' },
        ],
      },
    ],
  },
  {
    name: 'SPORT & MORE',
    events: [
      {
        id: 'randall',
        eventType: 'race',
        sourceKind: 'ad',
        stamp: 'RANDALL PARK · NIGHTLY · POST 8 PM',
        title: 'Thoroughbreds at Randall Park',
        blurb: 'Nine races nightly; the feature goes Saturday.',
        price: 'Grandstand $1.25 — as printed',
        section: 'SPORT · FROM A RACE CARD AD',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 19 · COL 1',
        clipNote: 'Race card advertisement',
        transcript:
          'RANDALL PARK RACE TRACK — 9 races nightly, post time 8:00. Feature Sat.: the [illegible] Handicap. Grandstand $1.25, clubhouse $2.50. Daily double closes 7:50.',
        facts: [
          { label: 'CARD', value: 'Nine races nightly' },
          { label: 'VENUE', value: 'Randall Park Race Track' },
          { label: 'DATE / TIME', value: 'Nightly · post 8:00 PM' },
          { label: 'PRICE AS PRINTED', value: 'Grandstand $1.25 · clubhouse $2.50' },
          { label: 'EXTRACTED FROM', value: 'Race card ad, p. 19' },
        ],
      },
      {
        id: 'indians',
        eventType: 'other',
        sourceKind: 'ad',
        stamp: 'MUNICIPAL STADIUM · SUN JUL 26 · 1:30 PM',
        title: 'Indians vs. Yankees, doubleheader',
        blurb: 'Sunday twin bill on the lakefront; Bat Day for the kids.',
        price: 'Bleachers 75¢ — as printed',
        section: 'SPORT · FROM A NOTICE',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 19 · COL 3',
        clipNote: 'Sports notice block',
        transcript:
          'INDIANS vs. NEW YORK — Sun. doubleheader, 1:30, Municipal Stadium. BAT DAY: free bat to youngsters 14 and under with paid adult. Bleachers 75¢, reserved [illegible].',
        facts: [
          { label: 'MATCH', value: 'Cleveland vs. New York (2)' },
          { label: 'VENUE', value: 'Municipal Stadium, lakefront' },
          { label: 'DATE / TIME', value: 'Sunday, July 26 1970 · 1:30 PM' },
          { label: 'PRICE AS PRINTED', value: 'Bleachers 75¢' },
          { label: 'EXTRACTED FROM', value: 'Sports notice, p. 19' },
        ],
      },
      {
        id: 'artmuseum',
        eventType: 'exhibition',
        sourceKind: 'listing',
        stamp: 'CLEVELAND MUSEUM OF ART · ALL WEEK · FREE',
        title: 'Summer exhibition, East Wing',
        blurb: 'The museum’s summer show runs daily; admission free as ever.',
        price: 'Free — as printed',
        section: 'EXHIBITION · FROM A LISTING',
        credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P. 20 · COL 2',
        clipNote: 'Museum listings block',
        transcript:
          'CLEVELAND MUSEUM OF ART, University Circle — summer exhibition continues, East Wing. Tues.–Sun., closed Mon. Admission free. Gallery talk Wed. 2:00 [loss].',
        facts: [
          { label: 'PROGRAM', value: 'Summer exhibition' },
          { label: 'VENUE', value: 'Cleveland Museum of Art' },
          { label: 'DATE / TIME', value: 'Tues–Sun, all week' },
          { label: 'PRICE AS PRINTED', value: 'Free' },
          { label: 'EXTRACTED FROM', value: 'Museum listing, p. 20' },
        ],
      },
    ],
  },
];

// Re-group by event_type — same logic REAL mode uses. The 1970 nightlife mix yields
// Music / Film / Theater / Sport & Racing (+ Exhibitions / Other), proving the calendar
// is data-driven, not a template hardcoded to four columns.
const sections: CalendarSection[] = buildSections(mockGrouped.flatMap((g) => g.events));

const indexItems: IndexItem[] = [
  {
    id: 'r1', typeLabel: 'ARTICLE', type: 'y-article', vis: null, isVisual: false,
    stamp: 'CLEVELAND · MAR 14 1937 · P.1', title: 'Mill gates open after the long strike',
    snippet: 'Men filed back through the Flats gate at dawn; the settlement holds wages at the [illegible] scale.',
    topics: ['t-labor'], names: [], cropNote: '', caption: '',
    credit: 'SOURCE: BROOKLYN NEWS · MAR 14 1937 · P.1 · COL 1–3', clipNote: 'Front-page article, three columns',
    transcript: 'The gates of the mill opened at six o’clock this morning for the first time since April. Under the settlement signed Friday, wages hold at the [illegible] scale and the grievance committee is recognized. [loss]',
  },
  {
    id: 'r2', typeLabel: 'PHOTOGRAPH', type: 'y-photo', vis: 'v-photo', isVisual: true, wallHeight: '200px',
    stamp: 'CLEVELAND · MAR 14 1937 · P.3', title: 'Crowd at the mill gate, the Flats',
    snippet: 'Photograph: returning workers at the mill gate, the Flats.',
    topics: ['t-labor'], names: [], cropNote: 'PHOTO — MILL-GATE CROWD, 1937', caption: 'Back to work — the first shift files through the mill gate in the Flats after eleven weeks out.',
    credit: 'SOURCE: BROOKLYN NEWS · MAR 14 1937 · P.3 · HALFTONE', clipNote: 'Halftone photograph, two columns',
    transcript: 'CAPTION — BACK TO WORK: The first shift files through the mill gate in the Flats after eleven weeks out. At left, [illegible], strike committee chairman.',
  },
  {
    id: 'r3', typeLabel: 'ADVERTISEMENT', type: 'y-ad', vis: 'v-ad', isVisual: true, wallHeight: '260px',
    stamp: 'CLEVELAND · JUL 23 1970 · P.12', title: 'Sly & The Family Stone at Public Auditorium',
    snippet: 'Quarter-page display ad — one night only, all seats reserved, "and a light show besides."',
    topics: ['t-amuse'], names: ['n-sly', 'n-aud', 'n-belkin'], cropNote: 'DISPLAY AD — SLY & THE FAMILY STONE, 1970', caption: 'Belkin Productions presents Sly & The Family Stone, Public Auditorium, Sat. July 25.',
    credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P.12 · COL 2–4', clipNote: 'Quarter-page display ad',
    transcript: 'BELKIN PRODUCTIONS PRESENTS — SLY AND THE FAMILY STONE — in person — PUBLIC AUDITORIUM, Sat. July 25, 8:30 p.m. All seats reserved: $5.50, $4.50, $3.50. [illegible] … and a light show besides.',
  },
  {
    id: 'r4', typeLabel: 'ARTICLE', type: 'y-article', vis: null, isVisual: false,
    stamp: 'CLEVELAND · FEB 1 1924 · P.2', title: 'Council takes up the transit fare',
    snippet: 'The three-cent fare returns to the floor; the mayor promises a decision before [loss].',
    topics: ['t-govt'], names: [], cropNote: '', caption: '',
    credit: 'SOURCE: BROOKLYN NEWS · FEB 1 1924 · P.2 · COL 4', clipNote: 'Council report, single column',
    transcript: 'City Council took up the transit fare question again Monday evening. The three-cent fare has its friends on the floor, but the commissioner’s figures show [illegible] per rider. The mayor promises a decision before [loss].',
  },
  {
    id: 'r5', typeLabel: 'CARTOON', type: 'y-cartoon', vis: 'v-cartoon', isVisual: true, wallHeight: '220px',
    stamp: 'CLEVELAND · OCT 8 1931 · P.4', title: 'The taxpayer carries City Hall',
    snippet: 'Editorial cartoon: a small figure labeled TAXPAYER shoulders the whole of City Hall.',
    topics: ['t-govt'], names: [], cropNote: 'CARTOON — “THE TAXPAYER”, 1931', caption: 'The taxpayer carries City Hall — editorial-page cartoon on the levy fight.',
    credit: 'SOURCE: BROOKLYN NEWS · OCT 8 1931 · P.4 · EDITORIAL PAGE', clipNote: 'Editorial cartoon, three columns',
    transcript: 'CAPTION — “AND THEY’RE ASKING HIM TO STAND UP STRAIGHTER.” Signed [illegible], editorial page.',
  },
  {
    id: 'r6', typeLabel: 'LISTING', type: 'y-listing', vis: null, isVisual: false,
    stamp: 'CLEVELAND · JUL 23 1970 · P.14', title: 'Amusements: this week’s engagements',
    snippet: 'The week’s club, stage, and screen engagements in one column — the calendar’s raw material.',
    topics: ['t-amuse'], names: ['n-aud'], cropNote: '', caption: '',
    credit: 'SOURCE: CLEVELAND SCENE · JUL 23 1970 · P.14 · COL 1', clipNote: 'Amusements listings column',
    transcript: 'AMUSEMENTS — THE AGORA: Damnation of Adam Blessing, thru Wed. PUBLIC AUDITORIUM: Sly & the Family Stone, Sat. 8:30. BLOSSOM: Johnny Mathis, Tues. [illegible] MUSICARNIVAL: Fiddler on the Roof, nightly exc. Mon.',
  },
  {
    id: 'r7', typeLabel: 'ARTICLE', type: 'y-article', vis: null, isVisual: false,
    stamp: 'CLEVELAND · AUG 9 1948 · P.1', title: 'Grace Bird of Denison Avenue named Miss Ohio',
    snippet: 'The west-side stenographer takes the crown at Cedar Point; the neighborhood plans a parade.',
    topics: [], names: ['n-bird'], cropNote: '', caption: '',
    credit: 'SOURCE: BROOKLYN NEWS · AUG 9 1948 · P.1 · COL 2', clipNote: 'Front-page feature',
    transcript: 'Grace Bird, 22, of Denison Avenue, was named Miss Ohio at Cedar Point Saturday night. Miss Bird, a stenographer at [illegible], will represent the state at Atlantic City in September.',
  },
  {
    id: 'r8', typeLabel: 'PHOTOGRAPH', type: 'y-photo', vis: 'v-photo', isVisual: true, wallHeight: '240px',
    stamp: 'CLEVELAND · AUG 12 1948 · P.6', title: 'Miss Ohio at Euclid Beach',
    snippet: 'Photograph: Grace Bird, Miss Ohio 1948, at the Euclid Beach pier.',
    topics: [], names: ['n-bird'], cropNote: 'PHOTO — MISS OHIO AT EUCLID BEACH, 1948', caption: 'Grace Bird, the new Miss Ohio, greets the crowd at Euclid Beach Wednesday.',
    credit: 'SOURCE: BROOKLYN NEWS · AUG 12 1948 · P.6 · HALFTONE', clipNote: 'Halftone photograph, two columns',
    transcript: 'CAPTION — Grace Bird, the new Miss Ohio, greets the crowd at Euclid Beach Wednesday. With her, [illegible] of the park company.',
  },
  {
    id: 'r9', typeLabel: 'MAP', type: 'y-map', vis: 'v-map', isVisual: true, wallHeight: '180px',
    stamp: 'CLEVELAND · JUN 3 1937 · P.5', title: 'The lakefront improvement plan',
    snippet: 'Printed map: the proposed lakefront improvements from the Stadium east to Gordon Park.',
    topics: ['t-govt'], names: [], cropNote: 'MAP — LAKEFRONT PLAN, 1937', caption: 'The lakefront plan as printed — Stadium east to Gordon Park, new fill shown hatched.',
    credit: 'SOURCE: BROOKLYN NEWS · JUN 3 1937 · P.5 · LINE CUT', clipNote: 'Line-cut map, four columns',
    transcript: 'KEY — Shaded: existing park. Hatched: proposed fill. Dotted: the shore drive as surveyed. Scale [illegible] feet to the inch.',
  },
  {
    id: 'r10', typeLabel: 'ADVERTISEMENT', type: 'y-ad', vis: 'v-ad', isVisual: true, wallHeight: '210px',
    stamp: 'CLEVELAND · SEP 2 1956 · P.8', title: 'Kresge’s back-to-school storefront',
    snippet: 'Half-page storefront ad — school supplies priced to the penny, Euclid Avenue store.',
    topics: [], names: ['n-euclid'], cropNote: 'AD — KRESGE’S BACK-TO-SCHOOL, 1956', caption: 'Kresge’s, Euclid at E. 4th — back-to-school, everything priced to the penny.',
    credit: 'SOURCE: BROOKLYN NEWS · SEP 2 1956 · P.8 · HALF PAGE', clipNote: 'Half-page display ad',
    transcript: 'S.S. KRESGE CO., Euclid at E. 4th — BACK TO SCHOOL: tablets 5¢, pencils 2 for 5¢, lunch kits 89¢, [illegible]. Open Thursday nights.',
  },
  {
    id: 'r11', typeLabel: 'ARTICLE', type: 'y-article', vis: null, isVisual: false,
    stamp: 'CLEVELAND · SEP 27 1954 · P.1', title: 'Indians take the pennant; city goes glad',
    snippet: 'The record 111th win clinches it; Euclid Avenue fills with paper and noise by nine o’clock.',
    topics: ['t-sports'], names: ['n-euclid'], cropNote: '', caption: '',
    credit: 'SOURCE: BROOKLYN NEWS · SEP 27 1954 · P.1 · COL 1–4', clipNote: 'Front-page sports lead',
    transcript: 'The Indians clinched the American League pennant Sunday with their 111th victory, a league record. By nine o’clock Euclid Avenue was ankle-deep in torn paper. [loss]',
  },
  {
    id: 'r12', typeLabel: 'PHOTOGRAPH', type: 'y-photo', vis: 'v-photo', isVisual: true, wallHeight: '190px',
    stamp: 'CLEVELAND · SEP 27 1954 · P.10', title: 'The bleachers at Municipal Stadium',
    snippet: 'Photograph: the packed bleachers on clinching day, Municipal Stadium.',
    topics: ['t-sports'], names: [], cropNote: 'PHOTO — STADIUM BLEACHERS, 1954', caption: 'Every seat and then some — the bleachers on clinching day at Municipal Stadium.',
    credit: 'SOURCE: BROOKLYN NEWS · SEP 27 1954 · P.10 · HALFTONE', clipNote: 'Halftone photograph, three columns',
    transcript: 'CAPTION — Every seat and then some: the bleacher crowd, estimated [illegible], on clinching day.',
  },
];

const facetDefs: FacetGroup[] = [
  {
    key: 'topic', name: 'TOPIC', note: 'MULTI', values: [
      { id: 't-labor', label: 'Labor', count: 214 },
      { id: 't-govt', label: 'Local Government', count: 187 },
      { id: 't-sports', label: 'Sports', count: 342 },
      { id: 't-amuse', label: 'Amusements', count: 496 },
    ],
  },
  {
    key: 'name', name: 'NAME', note: 'PEOPLE · PLACES · ORGS', values: [
      { id: 'n-sly', label: 'Sly & The Family Stone', count: 12 },
      { id: 'n-aud', label: 'Public Auditorium', count: 88 },
      { id: 'n-bird', label: 'Grace Bird / Miss Ohio', count: 6 },
      { id: 'n-euclid', label: 'Euclid Avenue', count: 154 },
      { id: 'n-belkin', label: 'Belkin Productions', count: 23 },
    ],
  },
  {
    key: 'type', name: 'TYPE', note: 'MULTI', values: [
      { id: 'y-article', label: 'Article', count: 1204 },
      { id: 'y-ad', label: 'Advertisement', count: 861 },
      { id: 'y-listing', label: 'Listing', count: 445 },
      { id: 'y-cartoon', label: 'Cartoon', count: 132 },
      { id: 'y-photo', label: 'Photograph', count: 208 },
      { id: 'y-map', label: 'Map', count: 41 },
    ],
  },
  {
    key: 'visual', name: 'PICTURES & ADS', note: 'VISUAL MODE', values: [
      { id: 'v-all', label: 'All illustrations', count: 1242 },
      { id: 'v-photo', label: 'Photos', count: 208 },
      { id: 'v-cartoon', label: 'Cartoons', count: 132 },
      { id: 'v-ad', label: 'Display ads', count: 861 },
      { id: 'v-map', label: 'Maps', count: 41 },
    ],
  },
];

export const mockDataset: Dataset = {
  mode: 'mock',
  weeks,
  sections,
  eventCount: sections.reduce((n, s) => n + s.events.length, 0),
  calendarAvailable: true,
  calendarNote: '',
  indexItems,
  facetDefs,
  indexHero: {
    kicker: 'THE INDEX',
    headline: 'Browse the paper the catalog never indexed.',
    deck: 'Every subject, name, place, and picture the paper mentions — pulled out by machine, so you can walk in through any of them.',
  },
  countsAreMock: true,
};
