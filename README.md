# Artist Open Studios Tour — Planner

## Connect your Google Sheet

1. In Google Sheets, **Share → General access → Anyone with the link → Viewer**. (The app reads data client-side with no API key, so the sheet must be link-viewable.)
2. Copy the sheet ID from its URL: `https://docs.google.com/spreadsheets/d/THIS_PART/edit`
3. Copy [config.example.js](config.example.js) to `config.js` (gitignored — it holds your live sheet ID and Maps key, so it's never committed) and set:
   - `SHEET_ID` — the ID from step 2
   - `SHEET_GID` — the tab's `gid` from the URL when that tab is open (`0` for the first tab)
4. Make sure the header row exactly matches the expected columns (Full Name, Registration Category, Sponsor Tier, County, Studio/Venue Name, Studio Address, Open to Hosting Another Artist?, Phone, SMS Opt-In, Tour Participation Count, Latitude, Longitude, Medium, Artist Bio, Image URL, AOS Tour Days, Website, Social Media, Accessibility Notes, Directions Notes, How did you hear about the AOS Tour?, Studio Group Artist Names).

**Group Type (Artist / Artist Group / Gallery / Museum) is derived from Registration Category, not read from a "Directory Listing Type" column** — an earlier version of this app expected the sheet to already have a clean Directory Listing Type column, but real JotForm exports just mirror Registration Category into that column verbatim, which isn't reliable. `data.js`'s `REGISTRATION_CATEGORY_TO_GROUP_TYPE` map now derives it directly:

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

## Connecting the real registration sheet

The real registration sheet holds sensitive data (phone, email, SMS opt-in) that must **not** become link-viewable. Since Google Sheets sharing is per file, not per tab, the public data lives in a **genuinely separate spreadsheet file**, fed from the real one by `IMPORTRANGE`. That derived file does all the renaming/combining, so `config.js` and the app never need to know JotForm's exact column layout — only the derived file's formulas do.

**Real sheet ID:** `1_lAYp-W6zkH82dvSKIQLZoCEa-i3Dh4sluIB8Qzo0ck` (private, restricted — never share this one).
**Derived public sheet ID:** `1l9vm7ErvCLIoewmitClRYxKg3DwCpNe8ZFZVDqNA4BA` (this is the one whose `gid` goes in `config.js`).

> ⚠️ **The real sheet's response tab is named `Artist Registrations Source`, not JotForm's default `Form Responses 1`.** This has already caused a `#REF!` error twice from the tab name reverting to the JotForm default when the formulas were rebuilt. **Double-check this tab name specifically** any time the `Import` tab formula is touched — it's the single most common way this breaks.

### Structure (all three tabs live in the derived public file)

**1. `Import` tab (hidden)** — pulls only these columns, by real-sheet letter: A, F, G, H, K, N, O, P, Q, R, S, T, U, W, X, Y, Z, AA, AB, AC, AM, AE, AG, AI, AJ. **Never** references Email (J), the email-consent checkbox (L), or SMS opt-in (M) — those never enter this file even transiently.

> ⚠️ **Column letters shift whenever a column is inserted into the real sheet** — this happened once already when a `GEOCODE` formula was added at AC/AD (Latitude/Longitude), which pushed everything after it (tour days, parking/directions, accessibility) two letters to the right. **Before editing this query, re-fetch the real sheet's current header row and re-derive letters from scratch rather than assuming the list below is still accurate** — don't just patch in new columns without checking whether existing ones moved.
>
> **Longitude specifically comes from AM, not AD.** AD is a spill target of the `GEOCODE` formula anchored in AC (no formula of its own), and `IMPORTRANGE` can't see spilled values in cells that don't hold their own formula — it silently came through blank. AM is a helper column (`=ARRAYFORMULA(IF(AD2:AD="","",AD2:AD))`) added specifically so Longitude has a real formula `IMPORTRANGE` can read. If Latitude/Longitude ever go missing again, check whether AM still exists and still points at AD before assuming the query is wrong.

```
=QUERY(IMPORTRANGE("1_lAYp-W6zkH82dvSKIQLZoCEa-i3Dh4sluIB8Qzo0ck", "Artist Registrations Source!A1:AM"),
  "select Col1, Col6, Col7, Col8, Col11, Col14, Col15, Col16, Col17, Col18, Col19, Col20, Col21, Col23, Col24, Col25, Col26, Col27, Col28, Col29, Col39, Col31, Col33, Col35, Col36",
  1)
```

Import's resulting columns (A–Y): A=registration type, B=first name, C=last name, D=group artist names, E=phone, F=website, G=Instagram, H=Facebook, I=LinkedIn, J=medium, K=participation count, L=bio, M=photo uploads, N=county, O=venue name, P=street, Q=suite, R=city, S=zip, **T=Latitude (from AC), U=Longitude (from AM, not AD — see note above)**, V=tour day(s), W=parking/directions, X=accessibility features, Y=accessibility other.

**2. `Working` tab (hidden)** — one clean, renamed/combined/derived column per field, computed with `ARRAYFORMULA`. Header row typed literally; data starts row 2:

| Col | Header | Formula |
|---|---|---|
| A | `Full Name` | `=ARRAYFORMULA(IF(Import!A2:A="","",TRIM(Import!B2:B&" "&Import!C2:C)))` — **not** "Recognition Name" (a separate, mostly sponsor-only field that's blank for most artist entries) |
| B | `County` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!N2:N))` |
| C | `Studio/Venue Name` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!O2:O))` |
| D | `Studio Address` | `=ARRAYFORMULA(IF(Import!A2:A="","",REGEXREPLACE(TRIM(IF(Import!P2:P="","",Import!P2:P)&IF(Import!Q2:Q="","", " "&Import!Q2:Q)&IF(Import!R2:R="","", ", "&Import!R2:R)&IF(Import!S2:S="","", ", "&Import!S2:S)),"^,\s*","")))` |
| E | `Phone` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!E2:E))` |
| F | `Medium` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!J2:J))` |
| G | `Artist Bio` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!L2:L))` |
| H | `Image URL` | `=ARRAYFORMULA(IF(Import!A2:A="","",SUBSTITUTE(Import!M2:M,CHAR(10),", ")))` |
| I | `AOS Tour Days` | `=ARRAYFORMULA(IF(Import!A2:A="","",SUBSTITUTE(Import!V2:V,CHAR(10),", ")))` |
| J | `Website` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!F2:F))` |
| K | `Social Media` | `=ARRAYFORMULA(IF(Import!A2:A="","",REGEXREPLACE(TRIM(IF(Import!G2:G="","",SUBSTITUTE(Import!G2:G,CHAR(10),", "))&IF(Import!H2:H="","", ", "&SUBSTITUTE(Import!H2:H,CHAR(10),", "))&IF(Import!I2:I="","", ", "&SUBSTITUTE(Import!I2:I,CHAR(10),", "))),"^,\s*","")))` |
| L | `Accessibility Notes` | `=ARRAYFORMULA(IF(Import!A2:A="","",REGEXREPLACE(TRIM(IF(Import!X2:X="","",SUBSTITUTE(Import!X2:X,CHAR(10),", "))&IF(Import!Y2:Y="","", "; "&Import!Y2:Y)),"^;\s*","")))` |
| M | `Directions Notes` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!W2:W))` |
| N | `Tour Participation Count` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!K2:K))` |
| O | `Latitude` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!T2:T))` |
| P | `Longitude` | `=ARRAYFORMULA(IF(Import!A2:A="","",Import!U2:U))` |
| Q | `Registration Category` | `=ARRAYFORMULA(IF(Import!A2:A="","",REGEXREPLACE(TRIM(Import!A2:A)," ?\(.*\)$","")))` — strips the `($100)`-style price suffix JotForm appends to the raw value |
| R | `Studio Group Artist Names` | `=ARRAYFORMULA(IF(Import!A2:A="","",SUBSTITUTE(Import!D2:D,CHAR(10),", ")))` |

**3. `Public` tab** — this is the one whose `gid` goes in `config.js`. Type the same 18 headers literally into **row 1**, then put this formula in **cell A2** (not A1 — `FILTER` spills across all 18 columns and down every matching row, so if it's entered in A1 that spill tries to overwrite the header cells in row 1 itself and Sheets throws `Array result was not expanded because it would overwrite data in K1` — K1 being the "Social Media" header, 11th of the 18 columns):

```
=FILTER(Working!A2:R, REGEXMATCH(Working!Q2:Q, "^(Individual Artist|Artist Group|Artist Group: Individual Artist|Gallery|Gallery-tier Sponsor|Museum)$"))
```

Sponsor-tier-only registrants (Friend/Bronze/Silver/Gold/Platinum) never make it into the public file at all.

### Known gaps / things to watch

- ~~No Latitude/Longitude source anywhere~~ — **resolved**: a `GEOCODE` formula on the real sheet now auto-spills Latitude/Longitude into columns AC/AD, and the `Working` tab pulls from them directly (see Import!T/U above). This is exactly the kind of insertion the ⚠️ note further up warns about — it's what pushed tour days/directions/accessibility two columns to the right the first time.
- **`TEXTJOIN` given multiple whole-column ranges does not combine row-by-row** — it flattens each range into one blob first, so every row ends up with the same merged value. This bit Studio Address, Social Media, and Accessibility Notes the first time these formulas were written; all three are now built with `IF()`/`&` concatenation instead, which does broadcast correctly per row. **Don't reintroduce multi-range `TEXTJOIN` if these formulas get reworked.**
- The `IF()`/`&` rewrite above went through a second round of bugs too — hand-typing nested `IF(cell="","", "separator"&cell)` calls is genuinely easy to get wrong (a dropped comma made one `IF` a 2-argument call that returned the literal boolean `FALSE` instead of blank whenever the cell *did* have a value; a stray unquoted semicolon broke another one outright with `#ERROR!`). The versions in the table above have been verified — quote/parenthesis balance checked, and the actual logic simulated against real rows (including blank-city/zip and single-social-link cases) rather than just eyeballed. **If these three formulas (Studio Address, Social Media, Accessibility Notes) get hand-edited again, verify the same way rather than typing a fix free-hand** — it's cheap to check and this exact mistake has now happened twice.
- Only `Individual Artist` and `Artist Group` registration-type wording has actually been confirmed against real submitted data (5-row sample). The Gallery/Museum/sponsor-tier option text is assumed to follow the same "words, then a price in parens" pattern but hasn't been directly observed — worth checking against the real JotForm dropdown options if filtering seems off for those categories.
- **The `Public` tab's `FILTER` formula must go in cell A2, not A1.** It's an 18-column-wide spilling array — placed in A1 it tries to overwrite the row-1 header cells and throws `Array result was not expanded because it would overwrite data in K1` (K1 = the "Social Media" header). This has already happened once.
- Share only the derived public file as link-viewable. The real registration sheet's sharing should stay restricted — it's been made link-viewable twice now (each time briefly, to re-inspect its column headers after a change) and should be set back to private after each time.

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
