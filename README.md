# Artist Open Studios Tour — Planner

## Connect your Google Sheet

1. In Google Sheets, **Share → General access → Anyone with the link → Viewer**. (The app reads data client-side with no API key, so the sheet must be link-viewable.)
2. Copy the sheet ID from its URL: `https://docs.google.com/spreadsheets/d/THIS_PART/edit`
3. Copy [config.example.js](config.example.js) to `config.js` (gitignored — it holds your live sheet ID and Maps key, so it's never committed) and set:
   - `SHEET_ID` — the ID from step 2
   - `SHEET_GID` — the tab's `gid` from the URL when that tab is open (`0` for the first tab)
4. Make sure the header row exactly matches the expected columns (Full Name, Registration Category, Sponsor Tier, County, Studio/Venue Name, Studio Address, Open to Hosting Another Artist?, Phone, SMS Opt-In, Tour Participation Count, Latitude, Longitude, Medium, Artist Bio, Image URL, AOS Tour Days, Website, Social Media, Accessibility Notes, Directions Notes, How did you hear about the AOS Tour?, Studio Group Artist Names).

**Group Type (Artist / Artist Group / Gallery / Museum) is derived from Registration Category, not read from a "Directory Listing Type" column** — an earlier version of this app expected the sheet to already have a clean Directory Listing Type column, but real JotForm exports just mirror Registration Category into that column verbatim, which isn't reliable. `data.js`'s `REGISTRATION_CATEGORY_TO_TYPE` map now derives it directly:

| Registration Category (exact JotForm wording) | Group Type |
|---|---|
| `Individual Artist` | Artist |
| `Artist Group: Individual Artist` | Artist |
| `Artist Group` | Artist Group |
| `Gallery` or `Gallery-tier Sponsor` | Gallery |
| `Museum` | Museum |

Anything else (sponsor tiers like Friend/Bronze/Silver/Gold/Platinum, or any other unrecognized value) is excluded from the list entirely — same as "Not Listed." If JotForm's wording ever changes, update that map in [data.js](data.js); nothing else needs to change.

**AOS Tour Days** holds only the day(s) an entry is participating (e.g. `Saturday` or `Saturday, Sunday`) — no times. A card shows a **Participating Today** badge whenever today's day of the week appears in that list.

Rows where **Registration Category** is `Artist Group` show a "Artists: …" line on the card, listing the names from **Studio Group Artist Names** (comma-separated in the sheet, split and re-joined for display). Leave that column blank for Individual Artist and Gallery rows.

**Image URL** can hold up to 3 comma-separated URLs (`url1.jpg, url2.jpg, url3.jpg`). Two or more show as a swipeable gallery with arrows and dots; one shows as a plain photo with no controls; empty or broken URLs fall back to an initials placeholder — that fallback applies per photo, so one broken URL in a multi-photo entry doesn't affect the others.

**Which name shows is decided by Registration Category, not by which field happens to be filled in.** Individual Artist and Artist Group: Individual Artist entries show Full Name; Artist Group, Gallery, and Museum entries show Studio/Venue Name — even though the sheet's Full Name column is *also* filled in for those rows (it's the point-of-contact name collected on every submission, regardless of category, so its mere presence can't be used to decide which name is public-facing). Each side still has a same-category fallback (Studio/Venue Name → Full Name for the venue-preferring categories, and vice versa) for the rare row missing its preferred field. See `displayName()` in [app.js](app.js).

**Full Name and Studio/Venue Name are title-cased on load** (in `toTitleCase()`, [data.js](data.js)) — so `KATHY EVERETT` or `kathy everett` in the sheet both display as `Kathy Everett`. It's smarter than plain word capitalization: `mcdonald` → `McDonald`, `macarthur` → `MacArthur` (but not `macy`/`mack`/`mace`, which stay ordinary words — the Mc/Mac rule only fires when at least 2 letters follow), `o'brien` → `O'Brien` (either apostrophe style), and `smith-jones` → `Smith-Jones`. Everything else gets standard title case, including minor words like "and" (e.g. "artists and makers" → "Artists And Makers") — no small-word exception list, per how this was specced.

The Medium tag only shows for Individual Artist and Artist Group: Individual Artist entries — it's hidden for Artist Group, Gallery, and Museum cards, since that field doesn't apply to them.

A gold **Nth Year** ribbon shows on a card/detail view whenever **Tour Participation Count** is a valid number ≥ 1 (e.g. `4` → "4th Year"). Blank or non-numeric values just hide the ribbon.

## Three views: Directory / Map / My Day

Below **1024px**, the header has a three-way tab switcher (Directory / Map / My Day) and one of the three fills the screen at a time — this matches the design's mobile layout.

At **1024px and up**, the layout switches to the design's desktop/tablet pattern instead: a filter sidebar on the left (vertical chips, with color dots on Group Type), the card list always visible in the middle, and a persistent right-hand **rail** that toggles between Map and My Day without ever hiding the list. The three columns scroll independently, and the breakpoint is live — resizing the window (no reload needed) switches between the two layouts instantly. **List** and **Map** share the same Group Type / County / **Medium** chip filters (Medium is a third filter alongside the original two, in both the horizontal mobile row and the sidebar's vertical list).

A card, its photo, its name, and a "Read More →" link below the bio are all independently clickable — any of them opens a full-screen **detail view**: tags, veteran ribbon, name, bio, then in order — AOS Tour Days, Studio Address (with a "Get Directions" button, see below), Directions Notes, **Phone**, Website, Social Media, Accessibility Options, and an Add/Remove-from-My-Day button. AOS Tour Days and Phone always show, even when blank ("Not provided") — everything else only shows when the sheet has a value. A "← Back to Directory" link at the top of the detail view returns to the Directory tab directly, alongside the round back-button on the photo. This is also where Accessibility Notes, Directions Notes, Phone, and Social Media actually get displayed — they were collected all along but had no home in the UI until now. **Email is deliberately never read or displayed anywhere** — there's no column mapping for it in `data.js` at all, by design, since it's meant to stay internal-only. One simplification from the design: the design shows stop details *inline in the rail* on tablet/desktop rather than full-screen; this app uses the same full-screen overlay at every width, which is simpler to maintain and still works well — flag it if you'd rather have the inline version.

**Get Directions** opens the Studio Address in the visitor's own maps app — Apple Maps on iOS, the Android default-app chooser via a `geo:` link elsewhere on mobile, and a Google Maps search tab on desktop (there's no single URL scheme that respects "the OS default" on every platform, so this picks the closest equivalent per platform via `directionsUrl()` in [app.js](app.js)).

**Social Media** can hold multiple comma-separated URLs, same pattern as Image URL. Each renders as a link labeled by platform (Instagram/Facebook/LinkedIn/etc., detected from the URL's domain), falling back to "Social Link" for anything unrecognized.

**Back to top:** both the Directory and My Day panels get a floating "↑ Top" button once you've scrolled past ~400px, scrolling that panel's own content back to the top — the button targets whichever element is actually the scrolling one (the whole page at narrow widths, that panel's own independently-scrolling column at wide widths).

### Map view

The Map view plots entries using **Latitude/Longitude** (real Google Maps, not a stylized illustration) and needs a Google Maps API key:

1. In Google Cloud Console, create (or reuse) a project, enable the **Maps JavaScript API**, attach a billing account (there's a generous free tier, but Google requires one on file), and create an API key.
2. Put that key in [config.js](config.js) as `GOOGLE_MAPS_API_KEY`. List and My Day work fine without this — the key is only needed to view the map.
3. The map script only loads the first time someone switches to Map view, so an unconfigured or invalid key doesn't affect the other views at all — it just shows an error message in the map panel instead.
4. **If you test locally and see a Google "Oops! Something went wrong" overlay on the map itself**, check the browser console for `RefererNotAllowedMapError` — your API key's HTTP referrer restrictions in Google Cloud Console don't include the origin you're testing from (e.g. `http://localhost:8420/`). Add it there, or add your real production domain before you deploy. This is a key-configuration step on Google's side, not an app bug — I confirmed the app's own code (script loading, marker creation) runs correctly even when this restriction blocks the visible tiles.

**Location grouping:** entries are merged into one pin whenever they share exact Latitude/Longitude *or* the same Studio/Venue Name (even transitively — if A matches B by coordinates and B matches C by venue name, all three share one pin). A single-entry location is a plain pin; a multi-entry location gets a count-badge pin that opens a small tappable list on click. Tapping any name (in that list, a single pin directly, or a card/plan-stop name anywhere in the app) opens that entry's full-screen detail view. A static legend (matching the pin colors in `GROUP_VISUALS`) sits under the map. Pins themselves are colored circles matching that legend (a grouped pin covering mixed Group Types just uses the first entry's color, since there's no single correct answer there).

### My Day (itinerary planner)

Add any stop to **Saturday** or **Sunday** via the "+ Add" button on a card, in the detail view, or from a map pin's popup — a small picker asks which day. Your plan is saved to `localStorage` on this device (works fully offline once the page has loaded once), with day tabs showing counts, a numbered stop order per day (colored by group type), a straight-line "~X.X mi from previous stop" distance note between consecutive stops when both have coordinates (not a real driving route/time — we don't have a routing API wired up, so this is honestly just straight-line distance), and Swap Day / Remove actions per stop.

The **Share** panel (tap the share icon) has no backend, so it's built entirely from things a static page can actually do:
- **Copy link** — encodes the day + stop IDs into the URL's query string (`?shareDay=Saturday&stops=0,4,8`) and copies it (falls back to a manual copy prompt if clipboard access is denied). Opening that link elsewhere shows a banner in My Day offering to add those stops to the visitor's own plan — it never overwrites an existing plan silently.
- **Email** — opens the visitor's own email app via a `mailto:` link, pre-filled with the itinerary and link, addressed to whatever address they typed in. Nothing is actually sent by this app — there's no email service behind it.
- **Print** — calls the browser's native print dialog.
- **Text** / **More** — an `sms:` link and, where supported, the native Web Share sheet (`navigator.share`); hidden gracefully when unsupported.

A small map above the stop list shows pins for only that day's planned stops (colored the same as the main map) — it only appears once at least one planned stop has coordinates, and stays hidden otherwise.

A real online/offline indicator sits in the header (reads `navigator.onLine` and updates on connectivity change) — unlike the original design mockup, it's read-only, not a manual toggle.

## Fallback photo

When an entry has no Image URL, or a provided photo URL fails to load, the app shows a branded stand-in image instead of plain initials. Save your image as:

```
assets/photo-placeholder.png
```

(PNG, any reasonable size — it's displayed with `object-fit: contain` on a Twilight Indigo background, so a logo-style image with transparency works well). If that file is missing or fails to load for any reason, it falls back further to the original colored-initials tile, so nothing breaks in the meantime.

Swapping test data for live data later is just swapping `SHEET_ID`/`SHEET_GID` in config.js — nothing else to change.

## Connecting the real registration sheet (later)

The real registration sheet holds sensitive data (phone, address, SMS opt-in) that must **not** become link-viewable. Since Google Sheets sharing is per file, not per tab, the public data has to live in a **genuinely separate spreadsheet file**, fed from the real one by `IMPORTRANGE`. That derived file also does the renaming/combining, so `config.js` and the app never need to know JotForm's exact column layout — only the derived file's formulas do.

**Registration Category doesn't need any derivation on the sheet side** — it's already a real column in the source sheet with the exact clean wording the app expects (`Individual Artist`, `Artist Group`, `Artist Group: Individual Artist`, `Gallery`, `Museum`, plus sponsor-tier values like `Friend`/`Bronze`/etc.). The derived file just needs to pass it through as one of its output columns; `data.js`'s `REGISTRATION_CATEGORY_TO_TYPE` map (see above) handles turning that into a Group Type.

The placeholders below (`<ANGLE_BRACKETS>`) need to be filled in against the real sheet's actual header row/column letters — paste that row to me and I'll fill them in for you instead of guessing.

### Structure (all three tabs live in the new, separate public file)

**1. `Import` tab (hidden)** — pulls *only* the specific raw columns needed for public fields out of the real sheet, in this order: Registration Category, Full Name, County, Studio/Venue Name, Street, Street 2/Suite, City, Zip, Medium, Artist Bio, Image URL, Saturday Hours, Sunday Hours, Website, Social Media, Accessibility Notes, Directions Notes, Tour Participation Count, Latitude, Longitude, Studio Group Artist Names (21 columns, A–U). Phone and SMS Opt-In are never referenced, so they never enter this file even transiently. One formula in `A1` (with header row included via the trailing `1`):

```
=QUERY(IMPORTRANGE("<REAL_SHEET_URL_OR_ID>", "<REAL_TAB_NAME>!A1:<LAST_COL>"),
  "select Col<REG_CATEGORY>, Col<FULL_NAME>, Col<COUNTY>, Col<VENUE_NAME>, Col<STREET>, Col<STREET2>, Col<CITY>, Col<ZIP>, Col<MEDIUM>, Col<BIO>, Col<IMAGE_URL>, Col<SAT_HOURS>, Col<SUN_HOURS>, Col<WEBSITE>, Col<SOCIAL>, Col<ACCESSIBILITY>, Col<DIRECTIONS>, Col<PARTICIPATION_COUNT>, Col<LAT>, Col<LNG>, Col<STUDIO_GROUP_ARTIST_NAMES>",
  1)
```

`ColN` refers to position in the imported range (Col1 = column A of `<REAL_TAB_NAME>`, Col2 = column B, etc.) — first authorization between the two files happens automatically the first time this runs. Keep the select order matching the 21-column list above so the `Import!` references below (A–U) line up.

**2. `Working` tab (hidden)** — one clean, renamed/combined column per field, computed with `ARRAYFORMULA`. Header row typed literally; data starts row 2:

| Col | Header (row 1, typed literally) | Formula (row 2) |
|---|---|---|
| A | `Registration Category` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!A2:A))` |
| B | `Full Name` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!B2:B))` |
| C | `County` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!C2:C))` |
| D | `Studio/Venue Name` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!D2:D))` |
| E | `Studio Address` | `=ARRAYFORMULA(IF(Import!A2:A="","",TRIM(TEXTJOIN(", ",TRUE,TEXTJOIN(" ",TRUE,Import!E2:E,Import!F2:F),Import!G2:G,Import!H2:H))))` — joins street + suite, then city, then zip, skipping any that are blank |
| F | `Medium` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!I2:I))` |
| G | `Artist Bio` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!J2:J))` |
| H | `Image URL` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!K2:K))` |
| I | `AOS Tour Days` | `=ARRAYFORMULA(IF(Import!A2:A="","",TRIM(TEXTJOIN(", ",TRUE,IF(Import!L2:L<>"","Saturday",""),IF(Import!M2:M<>"","Sunday","")))))` — assumes a separate checkbox/field per day; adjust to however the real form actually captures day selection |
| J | `Website` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!N2:N))` |
| K | `Social Media` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!O2:O))` |
| L | `Accessibility Notes` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!P2:P))` |
| M | `Directions Notes` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!Q2:Q))` |
| N | `Tour Participation Count` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!R2:R))` |
| O | `Latitude` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!S2:S))` |
| P | `Longitude` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!T2:T))` |
| Q | `Studio Group Artist Names` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!U2:U))` |

**3. `Public` tab** — this is the one whose `gid` goes in `config.js`. It's just:

```
=FILTER(Working!A2:Q, REGEXMATCH(Working!A2:A, "^(Individual Artist|Artist Group|Artist Group: Individual Artist|Gallery|Gallery-tier Sponsor|Museum)$"))
```

with the same 17 headers typed literally into row 1. This drops any row whose Registration Category isn't one of the recognized values — sponsor-tier-only registrants (Friend/Bronze/Silver/Gold/Platinum) never make it into the public file at all, same privacy intent as before, just without needing a separate derived "Not Listed" column.

### Notes

- The nested `TEXTJOIN`s (Studio Address, AOS Tour Days) are a well-established pattern for row-wise combining under `ARRAYFORMULA`, but I haven't been able to run these against your actual data. Before pointing `config.js` at this file, sanity-check a handful of rows — especially any with blank address/day sub-fields — to confirm the joins look right.
- Share only the derived file as link-viewable. The real registration sheet's sharing never changes.

## Run it locally

```bash
python3 -m http.server 8420
```

Then open `http://localhost:8420`.

## Fonts

Headings use Jost Bold, body text uses Poppins Regular — both loaded from Google Fonts (see the `<link>` in [index.html](index.html)).

## What's here

- `index.html` — page shell: header/tabs, chip filters, list/map/plan containers, detail overlay, add-to-day picker
- `config.example.js` — template; copy to `config.js` (gitignored) and fill in your sheet ID and Maps key — the only file you need to touch to point at a different sheet or key
- `data.js` — fetches the sheet (via the gviz JSON endpoint), normalizes rows, derives Group Type and the veteran-year label, and holds the shared `GROUP_VISUALS` (color/icon per Group Type) used by both cards and the map
- `app.js` — all app state and rendering: filters, cards, detail view, the My Day itinerary (plan state, localStorage persistence, share/email/print), and the connection indicator
- `map.js` — Google Maps loading, location grouping, markers, legend, tap-to-open-detail
- `styles.css` — brand styling
- `manifest.json` / `sw.js` / `icons/` — basic PWA scaffolding (installable, caches the app shell). Replace `icons/icon.svg` with real branded icons when you have them.
- `assets/photo-placeholder.png` — branded fallback photo (see "Fallback photo" above); not included in this repo, add your own.

## Where this UI came from

The List/Map/My Day structure, chip filters, card layout, veteran ribbon, and My Day panel were built to match a Claude Design canvas (`Plan Your Day.dc.html` + `StopCard`/`TourMap`/`DayPlanPanel` sub-components) that was exported as a standalone bundle and decoded locally. Two deliberate departures from that design, agreed on before building:
- **Map**: the design's Map tab was a stylized illustration with pins at made-up percent positions; this app keeps the real, already-working Google Maps view instead, restyled (colors/icons/legend) to match.
- **Share/email**: the design's share panel implied a backend email service with a fake "Sent" confirmation; this app only does what a static page honestly can (URL-encoded share link, `mailto:`, `window.print()`, `sms:`, native share) — no fake success states.
