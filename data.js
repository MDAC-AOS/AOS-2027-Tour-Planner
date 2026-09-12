// Fetches and normalizes artist/venue data from the configured Google Sheet.

// Visual identity per Group Type label: pin/badge color, icon ink, badge
// shape (border-radius), and an SVG path for the icon glyph.
const GROUP_VISUALS = {
  Artist: {
    color: '#ca2e1d', ink: '#ffffff', radius: '50%',
    icon: 'M10 2.5c-4.3 0-7.6 3.2-7.6 7.3 0 4.2 3.2 7.2 7.2 7.2 1.4 0 2-.8 1.6-1.7-.5-1.1.2-2.1 1.4-2.1h1.5c2 0 3.5-1.5 3.5-3.6 0-3.9-3.3-7.1-7.6-7.1zM6 10.6a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8zm2.4-3.7a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8zm3.7 0a1.4 1.4 0 110-2.8 1.4 1.4 0 010 2.8z',
  },
  'Artist Group': {
    color: '#f4962a', ink: '#253551', radius: '8px',
    icon: 'M2 17V8l5.5-3.5L13 8v9H2zm4-6h3v3H6v-3zm9-1.5v7.5h3V11l-3-1.5z',
  },
  Gallery: {
    color: '#59b5e7', ink: '#253551', radius: '2px',
    icon: 'M2.5 3h15v14h-15V3zm2 2v10h11V5h-11zm1.5 8.5L9 9l2 2.5L12.5 10l2 3.5H6z',
  },
  Museum: {
    color: '#253551', ink: '#fad62a', radius: '16px 16px 4px 4px',
    icon: 'M10 2l8 4.5H2L10 2zM4 8h2.2v6H4V8zm4.9 0h2.2v6H8.9V8zM13.8 8H16v6h-2.2V8zM2.5 15.2h15V17.5h-15v-2.3z',
  },
};

// Registration Category (as entered on the JotForm) -> the Group Type label
// used throughout the app (matches the GROUP_VISUALS keys above). The
// sheet's own Directory Listing Type column just mirrors Registration
// Category verbatim and isn't reliable, so this is derived instead.
// Anything not listed here (sponsor tiers like Friend/Bronze/Silver/Gold/
// Platinum) is excluded from the directory.
const REGISTRATION_CATEGORY_TO_GROUP_TYPE = {
  'individual artist': 'Artist',
  'artist group: individual artist': 'Artist',
  'artist group': 'Artist Group',
  gallery: 'Gallery',
  'gallery-tier sponsor': 'Gallery',
  museum: 'Museum',
};

// Sheet header text -> internal field name. Keys are normalized
// (lowercased, non-alphanumeric stripped) so small header variations
// (extra spaces, punctuation) still match.
const HEADER_FIELD_MAP = {
  fullname: 'fullName',
  registrationcategory: 'registrationCategory',
  sponsortier: 'sponsorTier',
  county: 'county',
  studiovenuename: 'studioVenueName',
  studioaddress: 'studioAddress',
  opentohostinganotherartist: 'openToHosting',
  phone: 'phone',
  smsoptin: 'smsOptIn',
  tourparticipationcount: 'tourParticipationCount',
  latitude: 'latitude',
  longitude: 'longitude',
  medium: 'medium',
  artistbio: 'artistBio',
  imageurl: 'imageUrl',
  aostourdays: 'aosTourDays',
  website: 'website',
  socialmedia: 'socialMedia',
  accessibilitynotes: 'accessibilityNotes',
  directionsnotes: 'directionsNotes',
  howdidyouhearabouttheaostour: 'howHeard',
  studiogroupartistnames: 'studioGroupArtistNames',
};

function normalizeHeader(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildSheetUrl() {
  const { SHEET_ID, SHEET_GID } = CONFIG;
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=1&gid=${encodeURIComponent(SHEET_GID)}`;
}

function parseGvizResponse(text) {
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
  if (!match) {
    throw new Error('Unexpected response format from Google Sheets.');
  }
  const json = JSON.parse(match[1]);
  if (json.status === 'error') {
    const message = (json.errors && json.errors[0] && json.errors[0].detailed_message) || 'Google Sheets returned an error.';
    throw new Error(message);
  }
  return json.table;
}

function tableToRecords(table) {
  const fieldsByColumnIndex = table.cols.map((col) => {
    const key = normalizeHeader(col.label);
    return HEADER_FIELD_MAP[key] || null;
  });

  return table.rows.map((row) => {
    const record = {};
    row.c.forEach((cell, i) => {
      const field = fieldsByColumnIndex[i];
      if (!field) return;
      record[field] = cell && cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : '';
    });
    return record;
  });
}

function deriveGroupType(record) {
  const key = (record.registrationCategory || '').trim().toLowerCase();
  return REGISTRATION_CATEGORY_TO_GROUP_TYPE[key] || null;
}

function isListable(record) {
  return deriveGroupType(record) !== null;
}

// Every comma-separated multi-value field (group member names, tour days,
// image URLs, social links) comes from the same sheet-formula pattern
// (SUBSTITUTE(..., CHAR(10), ", ")), so they all split the same way.
function splitList(raw, limit) {
  const items = String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return limit ? items.slice(0, limit) : items;
}

function parseGroupMemberNames(raw) {
  return splitList(raw);
}

function parseImageUrls(raw) {
  return splitList(raw, 3);
}

function parseSocialLinks(raw) {
  return splitList(raw);
}

function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return n + 'th';
  switch (n % 10) {
    case 1: return n + 'st';
    case 2: return n + 'nd';
    case 3: return n + 'rd';
    default: return n + 'th';
  }
}

function deriveVeteranLabel(raw) {
  const years = parseInt(raw, 10);
  if (!Number.isFinite(years) || years < 1) return null;
  return `${ordinal(years)} Year`;
}

// Title-cases a single word, lowercasing it first (so ALL-CAPS or all-lower
// sheet entries normalize the same way), with special handling for
// Mc/Mac surname prefixes. The 2+ character remainder requirement avoids
// misfiring on names like "Macy" or "Mack" that merely start with "Mac".
function titleCaseWord(word) {
  if (!word) return word;
  const lower = word.toLowerCase();
  let m = lower.match(/^mc([a-z]{2,})$/);
  if (m) return 'Mc' + m[1][0].toUpperCase() + m[1].slice(1);
  m = lower.match(/^mac([a-z]{2,})$/);
  if (m) return 'Mac' + m[1][0].toUpperCase() + m[1].slice(1);
  return lower[0].toUpperCase() + lower.slice(1);
}

// Capitalizes after apostrophes too (o'brien -> O'Brien), on top of the
// Mc/Mac handling in titleCaseWord.
function titleCaseSegment(segment) {
  return segment
    .split(/(['’])/)
    .map((part) => (part === "'" || part === '’' ? part : titleCaseWord(part)))
    .join('');
}

// Full title-case pass for a name/venue field: splits on spaces, then on
// hyphens within each word, capitalizing every part (smith-jones ->
// Smith-Jones) via titleCaseSegment.
function toTitleCase(str) {
  return String(str || '')
    .split(' ')
    .map((word) => word.split('-').map(titleCaseSegment).join('-'))
    .join(' ');
}

async function loadArtists() {
  if (!CONFIG.SHEET_ID || CONFIG.SHEET_ID === 'REPLACE_WITH_YOUR_SHEET_ID') {
    throw new Error('No Google Sheet configured yet. Set SHEET_ID in config.js.');
  }

  const response = await fetch(buildSheetUrl());
  if (!response.ok) {
    throw new Error(`Could not load the sheet (HTTP ${response.status}). Check that it's shared as "Anyone with the link can view".`);
  }

  const text = await response.text();
  const table = parseGvizResponse(text);
  const records = tableToRecords(table);

  return records
    .filter(isListable)
    .map((record) => {
      return {
        ...record,
        fullName: toTitleCase(record.fullName),
        studioVenueName: toTitleCase(record.studioVenueName),
        groupType: deriveGroupType(record),
        groupMemberNames: parseGroupMemberNames(record.studioGroupArtistNames),
        imageUrls: parseImageUrls(record.imageUrl),
        socialLinks: parseSocialLinks(record.socialMedia),
        veteranLabel: deriveVeteranLabel(record.tourParticipationCount),
      };
    });
}
