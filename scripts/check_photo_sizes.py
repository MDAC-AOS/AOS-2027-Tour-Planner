#!/usr/bin/env python3
"""
Checks the real download size of every registrant's uploaded photos and
reports anyone over a size threshold — so you know exactly who needs their
photos resized before spending time on it, instead of guessing.

Reads the same live Google Sheet + column mapping the app itself uses
(see data.js), so it always reflects the current sheet, including new
registrants.

Usage:
    python3 scripts/check_photo_sizes.py [--threshold-mb 1.5]

Requires: curl (already on macOS by default). No other setup needed.
"""

import argparse
import json
import re
import subprocess
import sys
import urllib.request

# Keep in sync with config.js.
SHEET_ID = '1l9vm7ErvCLIoewmitClRYxKg3DwCpNe8ZFZVDqNA4BA'
SHEET_GID = '257092711'

# Keep in sync with data.js's REGISTRATION_CATEGORY_TO_GROUP_TYPE — only
# these categories are actual directory listings.
LISTABLE_CATEGORIES = {
    'individual artist',
    'artist group: individual artist',
    'artist group',
    'gallery',
    'gallery-tier sponsor',
    'museum',
}

# Keep in sync with data.js's HEADER_FIELD_MAP.
HEADER_FIELD_MAP = {
    'fullname': 'fullName',
    'registrationcategory': 'registrationCategory',
    'studiovenuename': 'studioVenueName',
    'county': 'county',
    'imageurl': 'imageUrl',
}

BROWSER_USER_AGENT = (
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
)


def normalize_header(text):
    return re.sub(r'[^a-z0-9]', '', (text or '').lower())


def fetch_sheet_table():
    url = (
        f'https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq'
        f'?tqx=out:json&headers=1&gid={SHEET_GID}'
    )
    req = urllib.request.Request(url, headers={'User-Agent': BROWSER_USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode('utf-8')
    match = re.search(r'google\.visualization\.Query\.setResponse\((.*)\);?\s*$', text, re.S)
    if not match:
        raise RuntimeError('Unexpected response format from Google Sheets.')
    payload = json.loads(match.group(1))
    if payload.get('status') == 'error':
        errors = payload.get('errors') or [{}]
        raise RuntimeError(errors[0].get('detailed_message', 'Google Sheets returned an error.'))
    return payload['table']


def table_to_records(table):
    fields_by_column = [HEADER_FIELD_MAP.get(normalize_header(col.get('label'))) for col in table['cols']]
    records = []
    for row in table['rows']:
        record = {}
        for i, cell in enumerate(row.get('c') or []):
            field = fields_by_column[i] if i < len(fields_by_column) else None
            if not field:
                continue
            value = cell.get('v') if cell else None
            record[field] = str(value).strip() if value is not None else ''
        records.append(record)
    return records


def is_listable(record):
    return (record.get('registrationCategory') or '').strip().lower() in LISTABLE_CATEGORIES


def split_image_urls(raw, limit=3):
    items = [item.strip() for item in (raw or '').split(',') if item.strip()]
    return items[:limit]


def display_name(record):
    return record.get('fullName') or record.get('studioVenueName') or 'Untitled listing'


def download_size_bytes(url):
    """Real downloaded size via curl (JotForm redirects to a signed URL and
    blocks plain requests without a browser-like User-Agent)."""
    result = subprocess.run(
        ['curl', '-sL', '-A', BROWSER_USER_AGENT, '-o', '/dev/null', '-w', '%{size_download}', url],
        capture_output=True,
        text=True,
        timeout=60,
    )
    return int(result.stdout.strip() or 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--threshold-mb', type=float, default=1.5, help='Flag photos larger than this (default 1.5MB)')
    args = parser.parse_args()
    threshold_bytes = args.threshold_mb * 1024 * 1024

    print(f'Fetching live sheet…')
    table = fetch_sheet_table()
    records = [r for r in table_to_records(table) if is_listable(r)]
    print(f'{len(records)} listable registrants found. Checking photos (this can take a minute)…\n')

    flagged = []
    total_photos = 0
    total_bytes = 0

    for record in records:
        name = display_name(record)
        county = record.get('county') or ''
        urls = split_image_urls(record.get('imageUrl'))
        oversized = []
        for url in urls:
            total_photos += 1
            try:
                size = download_size_bytes(url)
            except Exception as err:
                print(f'  ! Could not check {name} — {url.split("/")[-1]}: {err}', file=sys.stderr)
                continue
            total_bytes += size
            if size >= threshold_bytes:
                oversized.append((url, size))
        if oversized:
            flagged.append((name, county, oversized))

    print('=' * 72)
    if not flagged:
        print(f'Nothing over {args.threshold_mb}MB — no action needed right now.')
    else:
        print(f'{len(flagged)} registrant(s) with at least one photo over {args.threshold_mb}MB:\n')
        for name, county, oversized in flagged:
            label = f'{name} ({county})' if county else name
            print(f'- {label}')
            for url, size in oversized:
                filename = url.split('/')[-1]
                print(f'    {size / 1024 / 1024:.2f}MB  {filename}')
                print(f'      {url}')
        print()

    checked_registrants = len(records)
    print(
        f'Checked {total_photos} photos across {checked_registrants} registrants — '
        f'{total_bytes / 1024 / 1024:.1f}MB total.'
    )


if __name__ == '__main__':
    main()
