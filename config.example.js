// App configuration
// Copy this file to config.js and fill in your own values. config.js is
// gitignored — it holds your live sheet ID and Google Maps API key, and
// should never be committed.
const CONFIG = {
  // The long ID from the sheet's URL:
  // https://docs.google.com/spreadsheets/d/THIS_PART/edit
  SHEET_ID: 'REPLACE_WITH_YOUR_SHEET_ID',

  // gid of the specific tab to read (0 = first/default tab).
  // Find it in the sheet's URL after "gid=" when that tab is selected.
  SHEET_GID: '0',

  // Google Maps JavaScript API key (needs a Google Cloud project with the
  // Maps JavaScript API enabled and billing attached). Used only for the
  // Map view; the List view works without it.
  GOOGLE_MAPS_API_KEY: 'REPLACE_WITH_YOUR_GOOGLE_MAPS_API_KEY',
};
