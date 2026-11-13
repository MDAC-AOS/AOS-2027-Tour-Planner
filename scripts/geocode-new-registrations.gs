/**
 * Fills in Latitude / Longitude for new registrations automatically.
 *
 * Lives in the PRIVATE "Artist Registrations Source" sheet
 * (Extensions > Apps Script). Every few minutes it looks for rows that have
 * a street address but no coordinates yet, looks the address up with Google's
 * own geocoder, and writes the result into the Latitude / Longitude columns.
 *
 * It never touches a row that already has a value or a GEOCODE formula in
 * the Latitude column, so the existing 46 rows are left alone.
 *
 * If an address can't be found, the Latitude cell is highlighted yellow with a
 * note, and the script won't keep retrying it. Fix the address (or type the
 * coordinates in by hand), delete the note, and it will be picked up again.
 *
 * SETUP (once): run `setUpAutomaticLookups` from the editor and approve the
 * permission prompts. To check things first without changing anything, run
 * `previewLookups` and read the log (View > Logs / Execution log).
 */

// ---- Settings: change these if the sheet's columns ever move ----
const SHEET_NAME = 'Artist Registrations Source';
const FIRST_DATA_ROW = 2;
const COL_STREET = 25; // Y
const COL_SUITE = 26;  // Z
const COL_CITY = 27;   // AA
const COL_ZIP = 28;    // AB
const COL_LAT = 29;    // AC
const COL_LNG = 30;    // AD
const MAX_PER_RUN = 25; // keeps each run well inside Google's daily limits
const NOT_FOUND_NOTE = 'No match found for this address. Fix the address, then delete this note to retry.';

function buildAddress_(row) {
  const street = String(row[COL_STREET - 1] || '').trim();
  const suite = String(row[COL_SUITE - 1] || '').trim();
  const city = String(row[COL_CITY - 1] || '').trim();
  const zip = String(row[COL_ZIP - 1] || '').trim();
  if (!street) return '';
  // Same pattern the old GEOCODE formula used: street suite, city, MD zip
  return (street + ' ' + suite).trim() + ', ' + city + ', MD ' + zip;
}

function rowsNeedingLookup_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return [];
  const count = lastRow - FIRST_DATA_ROW + 1;
  const width = COL_LNG;
  const values = sheet.getRange(FIRST_DATA_ROW, 1, count, width).getValues();
  const formulas = sheet.getRange(FIRST_DATA_ROW, COL_LAT, count, 1).getFormulas();
  const notes = sheet.getRange(FIRST_DATA_ROW, COL_LAT, count, 1).getNotes();
  const todo = [];
  values.forEach((row, i) => {
    const address = buildAddress_(row);
    if (!address) return;
    const hasLat = String(row[COL_LAT - 1]).trim() !== '';
    const hasFormula = formulas[i][0] !== '';
    const alreadyFailed = notes[i][0] === NOT_FOUND_NOTE;
    if (hasLat || hasFormula || alreadyFailed) return;
    todo.push({ sheetRow: FIRST_DATA_ROW + i, address: address });
  });
  return todo;
}

/** Runs on a timer. Fills in coordinates for any new rows. */
function fillMissingCoordinates() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error('Tab not found: ' + SHEET_NAME);
    const todo = rowsNeedingLookup_(sheet).slice(0, MAX_PER_RUN);
    const geocoder = Maps.newGeocoder().setRegion('us');
    todo.forEach((job) => {
      let result;
      try {
        result = geocoder.geocode(job.address);
      } catch (err) {
        // Temporary problem (quota, network): leave the row alone and retry next run.
        console.error('Lookup failed for row ' + job.sheetRow + ': ' + err);
        return;
      }
      const latCell = sheet.getRange(job.sheetRow, COL_LAT);
      if (result.status === 'OK' && result.results.length > 0) {
        const loc = result.results[0].geometry.location;
        sheet.getRange(job.sheetRow, COL_LAT, 1, 2).setValues([[loc.lat, loc.lng]]);
      } else if (result.status === 'ZERO_RESULTS') {
        latCell.setNote(NOT_FOUND_NOTE).setBackground('#fff2a8');
      } else {
        console.error('Row ' + job.sheetRow + ' status: ' + result.status);
      }
      Utilities.sleep(250);
    });
  } finally {
    lock.releaseLock();
  }
}

/** Run once. Sets the script to check for new registrations every 5 minutes. */
function setUpAutomaticLookups() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'fillMissingCoordinates')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('fillMissingCoordinates').timeBased().everyMinutes(5).create();
  fillMissingCoordinates();
}

/** Safe check: lists the rows that WOULD be looked up. Changes nothing. */
function previewLookups() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Tab not found: ' + SHEET_NAME);
  const todo = rowsNeedingLookup_(sheet);
  if (todo.length === 0) {
    console.log('Nothing to do: every row with an address already has coordinates.');
    return;
  }
  todo.forEach((job) => console.log('Row ' + job.sheetRow + ': ' + job.address));
}
