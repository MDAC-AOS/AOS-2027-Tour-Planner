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

  mapState.loading = new Promise((resolve, reject) => {
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
    script.onerror = () => reject(new Error('Failed to load Google Maps. Check the API key and network connection.'));
    document.head.appendChild(script);
  });

  return mapState.loading;
}

// Union-find: two entries count as "the same location" if they share exact
// lat/lng, or share a non-empty Studio/Venue Name, even transitively.
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

  const byLatLng = new Map();
  const byVenue = new Map();

  entries.forEach((entry, i) => {
    const lat = parseFloat(entry.latitude);
    const lng = parseFloat(entry.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (byLatLng.has(key)) union(i, byLatLng.get(key));
      else byLatLng.set(key, i);
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

function openEntryDetail(id) {
  openDetail(Number(id));
}

function showGroupInfoWindow(marker, group) {
  if (!mapState.infoWindow) {
    mapState.infoWindow = new google.maps.InfoWindow();
  }

  const items = group
    .map((entry) => {
      const label = entry.fullName || entry.studioVenueName || 'Untitled Listing';
      return `<li><button type="button" class="map-info__item" data-entry-id="${entry.id}">${escapeHtml(label)}</button></li>`;
    })
    .join('');

  mapState.infoWindow.setContent(
    `<div class="map-info"><strong class="map-info__title">${group.length} entries here</strong><ul class="map-info__list">${items}</ul></div>`
  );
  mapState.infoWindow.open({ map: mapState.map, anchor: marker });

  google.maps.event.addListenerOnce(mapState.infoWindow, 'domready', () => {
    document.querySelectorAll('.map-info__item').forEach((btn) => {
      btn.addEventListener('click', () => {
        openEntryDetail(btn.dataset.entryId);
        mapState.infoWindow.close();
      });
    });
  });
}

// A colored circle per Group Type, matching the legend. For a grouped pin
// covering entries of different types, the first entry's color is used —
// there's no single "correct" color when a location mixes group types.
function groupMarkerIcon(groupType) {
  const v = GROUP_VISUALS[groupType] || GROUP_VISUALS.Artist;
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: v.color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 12,
  };
}

function renderMapMarkers(entries) {
  clearMarkers();
  if (!mapState.map) return;

  const geocoded = entries.filter((entry) => {
    const lat = parseFloat(entry.latitude);
    const lng = parseFloat(entry.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });

  const groups = groupEntriesByLocation(geocoded);
  const bounds = new google.maps.LatLngBounds();

  groups.forEach((group) => {
    const anchor = group.find((entry) => Number.isFinite(parseFloat(entry.latitude)) && Number.isFinite(parseFloat(entry.longitude)));
    if (!anchor) return;

    const position = { lat: parseFloat(anchor.latitude), lng: parseFloat(anchor.longitude) };
    const visuals = GROUP_VISUALS[anchor.groupType] || GROUP_VISUALS.Artist;
    const marker = new google.maps.Marker({
      position,
      map: mapState.map,
      icon: groupMarkerIcon(anchor.groupType),
      label: group.length > 1 ? { text: String(group.length), color: visuals.ink, fontWeight: 'bold' } : undefined,
    });

    marker.addListener('click', () => {
      if (group.length === 1) {
        openEntryDetail(group[0].id);
      } else {
        showGroupInfoWindow(marker, group);
      }
    });

    mapState.markers.push(marker);
    bounds.extend(position);
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
      center: { lat: 38.4, lng: -122.7 },
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
      title: stop.fullName || stop.studioVenueName || '',
    });
    marker.addListener('click', () => openEntryDetail(stop.id));
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
      center: { lat: 38.4, lng: -122.7 },
      zoom: 9,
    });
  }

  renderMapMarkers(entries);
}
