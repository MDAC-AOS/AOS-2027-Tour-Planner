// Map view: groups entries that share a location into a single pin with a
// count badge, and lets visitors tap through to the matching card below.

const mapState = {
  loaded: false,
  loading: null,
  map: null,
  markers: [],
  infoWindow: null,
};

function loadGoogleMaps() {
  if (mapState.loaded) return Promise.resolve();
  if (mapState.loading) return mapState.loading;

  const promise = new Promise((resolve, reject) => {
    if (!CONFIG.GOOGLE_MAPS_API_KEY || CONFIG.GOOGLE_MAPS_API_KEY === 'REPLACE_WITH_YOUR_GOOGLE_MAPS_API_KEY') {
      reject(new Error('No Google Maps API key configured. Set GOOGLE_MAPS_API_KEY in config.js.'));
      return;
    }
    window.__onGoogleMapsLoaded = () => {
      mapState.loaded = true;
      resolve();
    };
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CONFIG.GOOGLE_MAPS_API_KEY)}&callback=__onGoogleMapsLoaded`;
    script.async = true;
    script.onerror = () => reject(new Error("Map isn't available right now — check your internet connection."));
    document.head.appendChild(script);
  });

  // Reset so a later call (e.g. once signal comes back) retries instead of
  // reusing this same rejected promise forever. Chained after assignment
  // below so it can't be clobbered by it.
  promise.catch(() => {
    mapState.loading = null;
  });

  mapState.loading = promise;
  return promise;
}

// Entries this close count as one stop: the same building or complex, where
// geocoding the same street address routinely lands a few feet to a few
// dozen feet apart (e.g. 11810 Parklawn). ~50 m / ~165 ft — pins any closer
// than that would sit on top of each other and hide one another anyway.
const SAME_LOCATION_MILES = 50 / 1609.34;

// Union-find: two entries count as "the same location" if they're within
// SAME_LOCATION_MILES of each other, or share a non-empty Studio/Venue Name,
// even transitively.
function groupEntriesByLocation(entries) {
  const parent = entries.map((_, i) => i);
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootA] = rootB;
  }

  const coords = entries.map((entry) => [parseFloat(entry.latitude), parseFloat(entry.longitude)]);
  const byVenue = new Map();

  entries.forEach((entry, i) => {
    const [lat, lng] = coords[i];
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      for (let j = 0; j < i; j++) {
        const [otherLat, otherLng] = coords[j];
        if (Number.isFinite(otherLat) && Number.isFinite(otherLng) && haversineMiles(lat, lng, otherLat, otherLng) <= SAME_LOCATION_MILES) {
          union(i, j);
        }
      }
    }

    const venueKey = (entry.studioVenueName || '').trim().toLowerCase();
    if (venueKey) {
      if (byVenue.has(venueKey)) union(i, byVenue.get(venueKey));
      else byVenue.set(venueKey, i);
    }
  });

  const groups = new Map();
  entries.forEach((entry, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(entry);
  });

  return [...groups.values()];
}

function clearMarkers() {
  mapState.markers.forEach((marker) => marker.setMap(null));
  mapState.markers = [];
}

function showGroupInfoWindow(marker, group) {
  if (!mapState.infoWindow) {
    mapState.infoWindow = new google.maps.InfoWindow();
  }

  const items = group
    .map((entry) => {
      const label = displayName(entry);
      return `<li><button type="button" class="map-info__item" data-entry-id="${entry.id}">${escapeHtml(label)}<span class="map-info__type">${escapeHtml(entry.groupType || '')}</span></button></li>`;
    })
    .join('');

  mapState.infoWindow.setContent(
    `<div class="map-info"><strong class="map-info__title">${group.length} stops in this area</strong><ul class="map-info__list">${items}</ul></div>`
  );
  mapState.infoWindow.open({ map: mapState.map, anchor: marker });

  google.maps.event.addListenerOnce(mapState.infoWindow, 'domready', () => {
    document.querySelectorAll('.map-info__item').forEach((btn) => {
      btn.addEventListener('click', () => {
        openDetail(btn.dataset.entryId);
        mapState.infoWindow.close();
      });
    });
  });
}

// Builds a rounded-rect (or circle, when the radius is large enough to fully
// round it) SVG path from a CSS border-radius string, so marker shapes stay
// in lockstep with the legend swatches' border-radius values instead of
// needing to be redrawn by hand if those ever change.
function roundedRectPath(x, y, size, radius) {
  const tokens = String(radius).trim().split(/\s+/);
  const toPx = (token) => (token.endsWith('%') ? (parseFloat(token) / 100) * size : parseFloat(token));
  const corners = tokens.length === 4 ? tokens.map(toPx) : Array(4).fill(toPx(tokens[0]));
  const max = size / 2;
  const [tl, tr, br, bl] = corners.map((r) => Math.min(r, max));
  return `M${x + tl},${y} H${x + size - tr} A${tr},${tr} 0 0 1 ${x + size},${y + tr}` +
    ` V${y + size - br} A${br},${br} 0 0 1 ${x + size - br},${y + size} H${x + bl}` +
    ` A${bl},${bl} 0 0 1 ${x},${y + size - bl} V${y + tl} A${tl},${tl} 0 0 1 ${x + tl},${y} Z`;
}

// A pin shaped and iconed exactly like its legend entry (same fill color,
// glyph, and border-radius shape). For a grouped pin covering entries of
// different types, the first entry's visuals are used — there's no single
// "correct" look when a location mixes group types. `dimmed` is the gray
// variant for stops outside the current filters (see "Show all stops").
//
// `count` > 1 adds a round number badge on the pin's top-right corner. It's
// drawn into the icon itself rather than using the Maps marker `label`, which
// is always centered on the icon — right on top of the glyph, in the glyph's
// own color — and so disappears into it (navy number over a navy building).
function groupMarkerIcon(groupType, { dimmed = false, count = 0 } = {}) {
  const base = GROUP_VISUALS[groupType] || GROUP_VISUALS.Artist;
  const v = dimmed ? { ...base, color: '#c3c7cf', ink: '#ffffff' } : base;
  const size = 30;
  const strokeWidth = 2;
  const inset = strokeWidth / 2;
  const boxSize = size - strokeWidth;
  const iconSize = 16;
  const iconOffset = (size - iconSize) / 2;
  const shapePath = roundedRectPath(inset, inset, boxSize, v.radius);

  const hasBadge = count > 1;
  const pad = hasBadge ? 8 : 0; // extra room above/right of the pin for the badge
  const canvas = size + pad;
  const badgeX = size - 3;
  const badgeY = pad + 3;
  const text = String(count);
  const badge = hasBadge
    ? `<circle cx="${badgeX}" cy="${badgeY}" r="9" fill="${dimmed ? '#8a8f9a' : '#253551'}" stroke="#ffffff" stroke-width="1.5"/>` +
      `<text x="${badgeX}" y="${badgeY + (text.length > 1 ? 3.5 : 4)}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="${text.length > 1 ? 10 : 11.5}" fill="#ffffff">${text}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">` +
    `<g transform="translate(0,${pad})">` +
    `<path d="${shapePath}" fill="${v.color}" stroke="#ffffff" stroke-width="${strokeWidth}"/>` +
    `<g transform="translate(${iconOffset},${iconOffset}) scale(${iconSize / 20})"><path d="${v.icon}" fill="${v.ink}"/></g>` +
    `</g>${badge}</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(canvas, canvas),
    // Anchored on the pin's center, not the (larger) canvas's, so the pin
    // still sits exactly on its location with or without a badge.
    anchor: new google.maps.Point(size / 2, pad + size / 2),
  };
}

// `entries` is the filtered list. With "Show all stops" on, every listing gets
// a pin, but pins with no entry in `entries` are drawn dimmed and the map
// still zooms to just the matching ones.
function renderMapMarkers(entries) {
  clearMarkers();
  if (!mapState.map) return;

  const matchingIds = new Set(entries.map((entry) => entry.id));
  const source = state.showAllPins ? state.all : entries;

  const geocoded = source.filter((entry) => {
    const lat = parseFloat(entry.latitude);
    const lng = parseFloat(entry.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });

  const groups = groupEntriesByLocation(geocoded);
  const bounds = new google.maps.LatLngBounds();

  groups.forEach((group) => {
    const isActive = group.some((entry) => matchingIds.has(entry.id));
    // Prefer a matching entry so an active pin looks like what the filters selected.
    const anchor = (isActive ? group.find((entry) => matchingIds.has(entry.id)) : group[0]);
    if (!anchor) return;

    const position = { lat: parseFloat(anchor.latitude), lng: parseFloat(anchor.longitude) };
    const marker = new google.maps.Marker({
      position,
      map: mapState.map,
      icon: groupMarkerIcon(anchor.groupType, { dimmed: !isActive, count: group.length }),
      zIndex: isActive ? 2 : 1,
    });

    marker.addListener('click', () => {
      if (group.length === 1) {
        openDetail(group[0].id);
      } else {
        showGroupInfoWindow(marker, group);
      }
    });

    mapState.markers.push(marker);
    if (isActive) bounds.extend(position);
  });

  if (!bounds.isEmpty()) {
    mapState.map.fitBounds(bounds, 40);
  }
}

// ---------- My Day mini map: pins for only the visitor's planned stops ----------

const planMapState = {
  map: null,
  markers: [],
};

function clearPlanMapMarkers() {
  planMapState.markers.forEach((marker) => marker.setMap(null));
  planMapState.markers = [];
}

async function renderPlanMap(stops) {
  const geocoded = stops.filter((stop) => {
    const lat = parseFloat(stop.latitude);
    const lng = parseFloat(stop.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });

  if (geocoded.length === 0) {
    el.planMapWrap.hidden = true;
    return;
  }

  try {
    await loadGoogleMaps();
  } catch (err) {
    el.planMapWrap.hidden = true;
    return;
  }

  el.planMapWrap.hidden = false;

  if (!planMapState.map) {
    planMapState.map = new google.maps.Map(document.getElementById('plan-map'), {
      center: { lat: 39.0, lng: -76.8 },
      zoom: 9,
    });
  }

  clearPlanMapMarkers();
  const bounds = new google.maps.LatLngBounds();

  geocoded.forEach((stop) => {
    const position = { lat: parseFloat(stop.latitude), lng: parseFloat(stop.longitude) };
    const marker = new google.maps.Marker({
      position,
      map: planMapState.map,
      icon: groupMarkerIcon(stop.groupType),
      title: displayName(stop),
    });
    marker.addListener('click', () => openDetail(stop.id));
    planMapState.markers.push(marker);
    bounds.extend(position);
  });

  if (!bounds.isEmpty()) {
    planMapState.map.fitBounds(bounds, 30);
  }
}

async function showMapView(entries) {
  try {
    await loadGoogleMaps();
  } catch (err) {
    console.error(err);
    el.mapStatus.textContent = err.message;
    el.mapStatus.hidden = false;
    return;
  }
  el.mapStatus.hidden = true;

  if (!mapState.map) {
    mapState.map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: 39.0, lng: -76.8 },
      zoom: 9,
    });
  }

  renderMapMarkers(entries);
}
