const PLAN_STORAGE_KEY = 'aosPlanV1';
const INSTALL_PROMPT_DISMISSED_KEY = 'aosInstallPromptDismissedV1';

const WIDE_QUERY = '(min-width: 1024px)';

const state = {
  all: [],
  // `view` drives the narrow-layout tab bar: 'list' | 'map' | 'plan', one
  // visible at a time. `railView` drives the wide-layout rail, which shows
  // the card list *and* a persistent side panel that toggles between
  // 'map' | 'plan' — see render()'s showingMap/showingPlan for how the two
  // combine per breakpoint.
  view: 'list',
  railView: 'map',
  filters: { groupType: 'all', county: 'all', medium: 'all', search: '' },
  plan: [],
  planDay: 'Saturday',
  pending: null,
  detailId: null,
  share: false,
  copied: false,
  emailOpen: false,
  email: '',
  emailSent: false,
  incomingShare: null,
};

const el = {
  grid: document.getElementById('card-grid'),
  status: document.getElementById('status-message'),
  resultCount: document.getElementById('result-count'),
  resetFilters: document.getElementById('reset-filters'),
  searchInput: document.getElementById('search-input'),
  searchInputSide: document.getElementById('search-input-side'),
  chipsGroup: document.getElementById('chips-group'),
  chipsCounty: document.getElementById('chips-county'),
  chipsMedium: document.getElementById('chips-medium'),
  chipsGroupSide: document.getElementById('chips-group-side'),
  chipsCountySide: document.getElementById('chips-county-side'),
  chipsMediumSide: document.getElementById('chips-medium-side'),
  resetFiltersSide: document.getElementById('reset-filters-side'),
  railTabs: document.querySelectorAll('.rail-tabs__btn'),
  railPlanCount: document.getElementById('rail-plan-count'),
  tabs: document.querySelectorAll('.tabs__btn'),
  planCountLabel: document.getElementById('plan-count-label'),
  mapView: document.getElementById('map-view'),
  mapStatus: document.getElementById('map-status'),
  mapLegendGrid: document.getElementById('map-legend-grid'),
  planView: document.getElementById('plan-view'),
  planTitle: document.getElementById('plan-title'),
  planSummary: document.getElementById('plan-summary'),
  planShareBtn: document.getElementById('plan-share-btn'),
  dayTabSat: document.getElementById('day-tab-sat'),
  dayTabSun: document.getElementById('day-tab-sun'),
  sharePanel: document.getElementById('share-panel'),
  planStops: document.getElementById('plan-stops'),
  planEmpty: document.getElementById('plan-empty'),
  planEmptyTitle: document.getElementById('plan-empty-title'),
  planMapWrap: document.getElementById('plan-map-wrap'),
  backToTopDirectory: document.getElementById('back-to-top-directory'),
  backToTopPlan: document.getElementById('back-to-top-plan'),
  backToTopDetail: document.getElementById('back-to-top-detail'),
  detailOverlay: document.getElementById('detail-overlay'),
  detailPhoto: document.getElementById('detail-photo'),
  detailBody: document.getElementById('detail-body'),
  detailBack: document.getElementById('detail-back'),
  installBanner: document.getElementById('install-banner'),
  installBannerText: document.getElementById('install-banner-text'),
  installBannerAction: document.getElementById('install-banner-action'),
  installBannerDismiss: document.getElementById('install-banner-dismiss'),
  pickerModal: document.getElementById('picker-modal'),
  pickerNote: document.getElementById('picker-note'),
  pickerSat: document.getElementById('picker-sat'),
  pickerSun: document.getElementById('picker-sun'),
  pickerCancel: document.getElementById('picker-cancel'),
  connPill: document.getElementById('conn-pill'),
  connDot: document.getElementById('conn-dot'),
  connLabel: document.getElementById('conn-label'),
};

// ---------- persistence ----------

function loadPlanFromStorage() {
  try {
    const raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.plan)) state.plan = saved.plan;
    if (saved.planDay === 'Saturday' || saved.planDay === 'Sunday') state.planDay = saved.planDay;
  } catch (err) {
    console.warn('Could not read saved plan:', err);
  }
}

function savePlanToStorage() {
  try {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({ plan: state.plan, planDay: state.planDay }));
  } catch (err) {
    console.warn('Could not save plan:', err);
  }
}

// ---------- shared helpers ----------

function bioExcerpt(bio, maxLength = 140) {
  const text = (bio || '').trim();
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
}

function initialsFallbackHtml(name) {
  return `<div class="card__photo card__photo--placeholder">${escapeHtml(initials(name))}</div>`;
}
window.initialsFallbackHtml = initialsFallbackHtml;

// Branded stand-in image, used when a listing has no photo of its own and
// as the fallback if a real photo URL fails to load. Falls back to the
// initials tile if the brand image itself is missing/fails.
function placeholderPhotoHtml(name) {
  const safeName = name.replace(/[\\']/g, '\\$&');
  return `<img class="card__photo card__photo--branded" src="assets/photo-placeholder.png" alt="${escapeHtml(name)}" loading="lazy" onerror="this.outerHTML = initialsFallbackHtml('${safeName}')">`;
}
window.placeholderPhotoHtml = placeholderPhotoHtml;

function photoSlideHtml(url, name) {
  return `<img class="card__photo" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.outerHTML = placeholderPhotoHtml('${name.replace(/[\\']/g, '\\$&')}')">`;
}

// Artist Group / Gallery / Museum listings often upload a logo as their
// only photo. A logo cropped to fill a photo-shaped frame loses its edges,
// so these show the full image (letterboxed) instead of cropping to fill.
function usesContainPhoto(groupType) {
  return Boolean(groupType) && groupType !== 'Artist';
}

function photoMarkup(imageUrls, name) {
  if (imageUrls.length === 0) {
    return placeholderPhotoHtml(name);
  }
  if (imageUrls.length === 1) {
    return photoSlideHtml(imageUrls[0], name);
  }
  const slides = imageUrls.map((url) => `<div class="gallery__slide">${photoSlideHtml(url, name)}</div>`).join('');
  const dots = imageUrls
    .map((_, i) => `<span class="gallery__dot${i === 0 ? ' gallery__dot--active' : ''}"></span>`)
    .join('');
  return `
    <div class="gallery">
      <div class="gallery__track">${slides}</div>
      <button type="button" class="gallery__arrow gallery__arrow--prev" aria-label="Previous photo">&#8249;</button>
      <button type="button" class="gallery__arrow gallery__arrow--next" aria-label="Next photo">&#8250;</button>
      <div class="gallery__dots">${dots}</div>
    </div>
  `;
}

// Every uploaded photo shown in full (object-fit: contain), unlike the
// cropped hero carousel above — so a visitor can see the whole image
// regardless of its original orientation, including the one already used
// as the hero.
function photoGalleryHtml(imageUrls, name) {
  if (imageUrls.length === 0) return '';
  const items = imageUrls
    .map(
      (url) => `
        <div class="photo-gallery__item">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.closest('.photo-gallery__item').remove()">
        </div>
      `
    )
    .join('');
  return `
    <div class="detail-section">
      <div class="detail-section__label">Photo Gallery</div>
      <div class="photo-gallery">${items}</div>
    </div>
  `;
}

function socialPlatformLabel(url) {
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com')) return 'Instagram';
  if (lower.includes('facebook.com')) return 'Facebook';
  if (lower.includes('linkedin.com')) return 'LinkedIn';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'Twitter/X';
  if (lower.includes('tiktok.com')) return 'TikTok';
  if (lower.includes('youtube.com')) return 'YouTube';
  if (lower.includes('pinterest.com')) return 'Pinterest';
  return 'Social Link';
}

// No single URL scheme respects "the phone's default maps app" on both
// platforms — iOS always opens maps.apple.com links in Apple Maps, while
// Android's geo: scheme is what actually triggers its default-app chooser.
// This picks whichever of those matches the visitor's device.
function directionsUrl(address) {
  const query = encodeURIComponent(address);
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  if (isIOS) return `https://maps.apple.com/?q=${query}`;
  if (isAndroid) return `geo:0,0?q=${query}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function groupBadgeHtml(groupType, { inline = false } = {}) {
  const v = GROUP_VISUALS[groupType] || GROUP_VISUALS.Artist;
  return `
    <span class="group-badge${inline ? ' group-badge--inline' : ''}" style="background:${v.color}; color:${v.ink};">
      <svg width="12" height="12" viewBox="0 0 20 20" fill="${v.ink}" aria-hidden="true"><path d="${v.icon}"></path></svg>
      <span>${escapeHtml(groupType)}</span>
    </span>
  `;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function isInPlan(id) {
  return state.plan.some((p) => p.id === id);
}

function findArtist(id) {
  return state.all.find((a) => a.id === id);
}

// Everything the UI derives from Registration Category, computed once so
// the three call sites below (name, card, detail view) can't drift out of
// sync with each other if this logic ever needs to change.
function listingMeta(artist) {
  const category = (artist.registrationCategory || '').trim().toLowerCase();
  const isArtistGroup = category === 'artist group';
  const showsVenueName = isArtistGroup || category === 'gallery' || category === 'museum';
  const showsMedium = category === 'individual artist' || category === 'artist group: individual artist';
  return {
    showsVenueName,
    memberNames: isArtistGroup ? (artist.groupMemberNames || []) : [],
    medium: showsMedium ? (artist.medium || '') : '',
  };
}

// Artist Group / Gallery / Museum entries always collect a point-of-contact
// Full Name on the form too, so presence alone can't be used to decide which
// name to show — Registration Category decides instead.
function displayName(artist) {
  if (listingMeta(artist).showsVenueName) {
    return artist.studioVenueName || artist.fullName || 'Untitled Listing';
  }
  return artist.fullName || artist.studioVenueName || 'Untitled Listing';
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// A stable ID derived from name + county, so it survives across page loads
// and stays valid in a shared "My Day" link even if the underlying sheet's
// row order changes (unlike an array-index ID, which would silently point
// at a different artist if a row above it were ever deleted or reordered).
function deriveArtistId(artist) {
  return slugify(`${displayName(artist)}-${artist.county || ''}`) || 'listing';
}

// Two rows can legitimately produce the same name+county slug (e.g. a
// data-entry duplicate); appending a counter for repeats keeps every ID
// unique so two different listings never collide onto one detail page.
function assignArtistIds(artists) {
  const seen = new Map();
  artists.forEach((artist) => {
    const base = deriveArtistId(artist);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    artist.id = count === 0 ? base : `${base}-${count + 1}`;
  });
}

// ---------- card rendering ----------

function cardTemplate(artist) {
  const name = displayName(artist);
  const county = artist.county || 'County not listed';
  const days = artist.aosTourDays || 'Days not provided';
  const bio = bioExcerpt(artist.artistBio);
  const imageUrls = artist.imageUrls || [];
  const { memberNames, medium } = listingMeta(artist);
  const inPlan = isInPlan(artist.id);

  const containClass = usesContainPhoto(artist.groupType) ? ' card__photo-wrap--contain' : '';

  return `
    <article class="card" data-entry-id="${artist.id}" data-open-detail="${artist.id}">
      <div class="card__photo-wrap${containClass}">
        ${photoMarkup(imageUrls, name)}
        ${groupBadgeHtml(artist.groupType)}
      </div>
      <div class="card__body">
        <div class="card__tags">
          <span class="tag-solid">${escapeHtml(county)}</span>
          ${medium ? `<span class="tag-accent">${escapeHtml(medium)}</span>` : ''}
        </div>
        <h3 class="card__name" data-open-detail="${artist.id}">${escapeHtml(name)}</h3>
        ${artist.veteranLabel ? `<span class="status-ribbon">${escapeHtml(artist.veteranLabel)}</span>` : ''}
        ${memberNames.length ? `<p class="card__members"><strong>Artists:</strong> ${escapeHtml(memberNames.join(', '))}</p>` : ''}
        ${bio ? `<p class="card__bio">${escapeHtml(bio)}</p>` : ''}
        <button type="button" class="read-more-link" data-open-detail="${artist.id}">Read More →</button>
        <div class="card__footer">
          <span class="card__days">${escapeHtml(days)}</span>
          <button type="button" class="add-btn ${inPlan ? 'add-btn--active' : ''}" data-add-id="${artist.id}">${inPlan ? '✓ In my day' : '+ Add'}</button>
        </div>
      </div>
    </article>
  `;
}

// ---------- filters ----------

function applyFilters() {
  const { groupType, county, medium, search } = state.filters;
  const searchTerm = search.trim().toLowerCase();
  return state.all.filter((artist) => {
    const matchesGroupType = groupType === 'all' || artist.groupType === groupType;
    const matchesCounty = county === 'all' || artist.county === county;
    const matchesMedium = medium === 'all' || artist.medium === medium;
    const matchesSearch = !searchTerm || displayName(artist).toLowerCase().includes(searchTerm);
    return matchesGroupType && matchesCounty && matchesMedium && matchesSearch;
  });
}

function chipRow(container, options, activeValue, onPick) {
  container.innerHTML = options
    .map((opt) => {
      const active = opt.value === activeValue;
      return `<button type="button" class="chip ${active ? 'chip--active' : ''}" data-value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>`;
    })
    .join('');
  container.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => onPick(btn.dataset.value));
  });
}

function chipCol(container, options, activeValue, onPick, { withDots = false } = {}) {
  container.innerHTML = options
    .map((opt) => {
      const active = opt.value === activeValue;
      const dot = withDots
        ? `<span class="chip-side__dot" style="background:${opt.value === 'all' ? 'rgba(37,53,81,0.25)' : (GROUP_VISUALS[opt.value] || {}).color || '#ccc'}; border-radius:${opt.value === 'all' ? '3px' : (GROUP_VISUALS[opt.value] || {}).radius || '3px'};"></span>`
        : '';
      return `<button type="button" class="chip-side ${active ? 'chip-side--active' : ''}" data-value="${escapeHtml(opt.value)}">${dot}<span>${escapeHtml(opt.label)}</span></button>`;
    })
    .join('');
  container.querySelectorAll('.chip-side').forEach((btn) => {
    btn.addEventListener('click', () => onPick(btn.dataset.value));
  });
}

function renderChips() {
  const groupTypes = uniqueSorted(state.all.map((a) => a.groupType));
  const counties = uniqueSorted(state.all.map((a) => a.county));
  const mediums = uniqueSorted(state.all.map((a) => a.medium));

  const groupOptions = [{ value: 'all', label: 'All types' }, ...groupTypes.map((g) => ({ value: g, label: g }))];
  const countyOptions = [{ value: 'all', label: 'All counties' }, ...counties.map((c) => ({ value: c, label: c }))];
  const mediumOptions = [{ value: 'all', label: 'All media' }, ...mediums.map((m) => ({ value: m, label: m }))];

  const pickGroup = (value) => {
    state.filters.groupType = value;
    renderChips();
    render();
  };
  const pickCounty = (value) => {
    state.filters.county = value;
    renderChips();
    render();
  };
  const pickMedium = (value) => {
    state.filters.medium = value;
    renderChips();
    render();
  };

  chipRow(el.chipsGroup, groupOptions, state.filters.groupType, pickGroup);
  chipRow(el.chipsCounty, countyOptions, state.filters.county, pickCounty);
  chipRow(el.chipsMedium, mediumOptions, state.filters.medium, pickMedium);

  chipCol(el.chipsGroupSide, groupOptions, state.filters.groupType, pickGroup, { withDots: true });
  chipCol(el.chipsCountySide, countyOptions, state.filters.county, pickCounty);
  chipCol(el.chipsMediumSide, mediumOptions, state.filters.medium, pickMedium);
}

// ---------- list view ----------

function renderList(filtered) {
  el.resultCount.textContent = `${filtered.length} listing${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    el.grid.innerHTML = '<p class="status-message">No stops match those filters. Try widening your search.</p>';
    return;
  }

  el.grid.innerHTML = filtered.map(cardTemplate).join('');
  wireGalleryScrollSync(el.grid);
}

// ---------- map view ----------

function renderMapLegend() {
  el.mapLegendGrid.innerHTML = Object.keys(GROUP_VISUALS)
    .map((label) => {
      const v = GROUP_VISUALS[label];
      return `
        <div class="map-legend__item">
          <span class="map-legend__swatch" style="background:${v.color}; border-radius:${v.radius};">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="${v.ink}" aria-hidden="true"><path d="${v.icon}"></path></svg>
          </span>
          <span>${escapeHtml(label)}</span>
        </div>
      `;
    })
    .join('');
}

// ---------- distance helper (real coordinates, straight-line only) ----------

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceNote(prevArtist, artist) {
  if (!prevArtist) return '';
  const lat1 = parseFloat(prevArtist.latitude);
  const lng1 = parseFloat(prevArtist.longitude);
  const lat2 = parseFloat(artist.latitude);
  const lng2 = parseFloat(artist.longitude);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return '';
  const miles = haversineMiles(lat1, lng1, lat2, lng2);
  return `~${miles.toFixed(1)} mi straight-line from ${displayName(prevArtist)}`;
}

// ---------- plan (My Day) view ----------

function dayStops(day) {
  return state.plan
    .filter((p) => p.day === day)
    .map((p) => findArtist(p.id))
    .filter(Boolean);
}

// Swaps a stop with its same-day neighbor in `state.plan`. Neighbors of the
// other day may sit between them in the raw array (both days share one
// list), so this walks past those rather than assuming adjacency.
function moveStop(id, direction) {
  const plan = state.plan;
  const indexA = plan.findIndex((p) => p.id === id);
  if (indexA === -1) return;
  const day = plan[indexA].day;
  let indexB = indexA + direction;
  while (indexB >= 0 && indexB < plan.length && plan[indexB].day !== day) {
    indexB += direction;
  }
  if (indexB < 0 || indexB >= plan.length) return;
  [plan[indexA], plan[indexB]] = [plan[indexB], plan[indexA]];
  savePlanToStorage();
  render();
}

function planStopRow(artist, index, prevArtist, day, total) {
  const v = GROUP_VISUALS[artist.groupType] || GROUP_VISUALS.Artist;
  const otherDay = day === 'Saturday' ? 'Sunday' : 'Saturday';
  const note = distanceNote(prevArtist, artist);
  return `
    <div class="plan-stop">
      <div class="plan-stop__order">
        <button type="button" class="reorder-btn" data-move-id="${artist.id}" data-move-dir="-1" aria-label="Move up" ${index === 0 ? 'disabled' : ''}>▲</button>
        <div class="plan-stop__num" style="background:${v.color}; color:${v.ink}; border-radius:${v.radius};">${index + 1}</div>
        <button type="button" class="reorder-btn" data-move-id="${artist.id}" data-move-dir="1" aria-label="Move down" ${index === total - 1 ? 'disabled' : ''}>▼</button>
      </div>
      <div class="plan-stop__body">
        <div class="plan-stop__name" data-open-detail="${artist.id}">${escapeHtml(displayName(artist))}</div>
        <div class="plan-stop__meta">${escapeHtml(artist.groupType)} · ${escapeHtml(artist.county || '')} · ${escapeHtml(artist.aosTourDays || '')}</div>
        ${note ? `<div class="plan-stop__drive">${escapeHtml(note)}</div>` : ''}
      </div>
      <div class="plan-stop__actions">
        <button type="button" class="swap-btn" data-swap-id="${artist.id}" data-swap-to="${otherDay}">Move to ${otherDay === 'Saturday' ? 'Sat' : 'Sun'}</button>
        <button type="button" class="remove-btn" data-remove-id="${artist.id}">Remove</button>
      </div>
    </div>
  `;
}

function buildShareUrl(day, ids) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('shareDay', day);
  url.searchParams.set('stops', ids.join(','));
  return url.toString();
}

function itineraryText(day, stops) {
  const lines = [`My AOS Tour plan for ${day}:`, ''];
  stops.forEach((s, i) => {
    lines.push(`${i + 1}. ${displayName(s)} — ${s.county || ''} — ${s.aosTourDays || ''}`);
  });
  return lines.join('\n');
}

// Draws a branded snapshot of the day's itinerary onto a canvas, so it can
// be shared as an actual image instead of plain text — messaging apps don't
// generate rich previews for arbitrary links, so text-only sharing has no
// visual at all.
function renderItineraryCanvas(day, stops) {
  const width = 800;
  const headerHeight = 130;
  const rowHeight = 88;
  const footerHeight = 60;
  const height = headerHeight + stops.length * rowHeight + footerHeight;
  const scale = window.devicePixelRatio || 1;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#f7f7f7';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#253551';
  ctx.fillRect(0, 0, width, headerHeight);
  ctx.fillStyle = '#fad62a';
  ctx.font = '700 13px Helvetica, Arial, sans-serif';
  ctx.fillText('ARTIST OPEN STUDIOS TOUR 2027', 32, 38);
  ctx.fillStyle = '#ffffff';
  ctx.font = "700 32px 'Jost', Helvetica, Arial, sans-serif";
  ctx.fillText(`My Day — ${day}`, 32, 78);
  ctx.fillStyle = '#fad62a';
  ctx.font = "400 15px 'Poppins', Helvetica, Arial, sans-serif";
  ctx.fillText(`${stops.length} stop${stops.length === 1 ? '' : 's'} planned`, 32, 105);

  let y = headerHeight;
  stops.forEach((s, i) => {
    const v = GROUP_VISUALS[s.groupType] || GROUP_VISUALS.Artist;

    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f0f0f0';
    ctx.fillRect(0, y, width, rowHeight);

    ctx.fillStyle = v.color;
    ctx.beginPath();
    ctx.arc(64, y + rowHeight / 2, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = v.ink;
    ctx.font = "700 17px 'Jost', Helvetica, Arial, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), 64, y + rowHeight / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = '#253551';
    ctx.font = "700 21px 'Jost', Helvetica, Arial, sans-serif";
    ctx.fillText(displayName(s), 106, y + 38);

    ctx.fillStyle = 'rgba(37, 53, 81, 0.75)';
    ctx.font = "400 14px 'Poppins', Helvetica, Arial, sans-serif";
    const meta = [s.groupType, s.county, s.aosTourDays].filter(Boolean).join('  ·  ');
    ctx.fillText(meta, 106, y + 62);

    y += rowHeight;
  });

  ctx.fillStyle = '#253551';
  ctx.fillRect(0, y, width, footerHeight);
  ctx.fillStyle = '#fad62a';
  ctx.font = "600 14px 'Poppins', Helvetica, Arial, sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText(`Plan your own day at ${location.host}`, width / 2, y + footerHeight / 2 + 5);
  ctx.textAlign = 'left';

  return canvas;
}

// Shares the itinerary as an actual image file via the native share sheet
// when the platform supports sharing files (modern iOS/Android); otherwise
// falls back to downloading the image so it can be attached manually.
async function shareItineraryImage(day, stops, link) {
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (err) {
      // Font loading is best-effort — draw with fallback fonts if it fails.
    }
  }
  const canvas = renderItineraryCanvas(day, stops);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const file = new File([blob], `my-day-${day.toLowerCase()}.png`, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `My AOS Tour plan — ${day}`,
        text: `${itineraryText(day, stops)}\n${link}`,
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Image share failed, falling back to download:', err);
    }
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `my-day-${day.toLowerCase()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function renderSharePanel(day, stops) {
  if (!state.share) {
    el.sharePanel.hidden = true;
    el.sharePanel.innerHTML = '';
    return;
  }
  el.sharePanel.hidden = false;
  const link = buildShareUrl(day, stops.map((s) => s.id));
  const text = itineraryText(day, stops);
  const smsHref = `sms:?&body=${encodeURIComponent(text + '\n' + link)}`;
  const canNativeShare = typeof navigator.share === 'function';

  el.sharePanel.innerHTML = `
    <div class="share-panel__header">
      <div class="share-panel__title">Share ${escapeHtml(day)}</div>
      <button type="button" class="link-btn link-btn--red" id="share-close">Close</button>
    </div>
    <div class="share-panel__link-row">
      <span class="share-panel__link" id="share-link-text">${escapeHtml(link)}</span>
      <button type="button" class="copy-btn ${state.copied ? 'copy-btn--done' : ''}" id="share-copy-btn">${state.copied ? 'Copied' : 'Copy'}</button>
    </div>
    <div class="share-panel__tiles">
      <button type="button" class="share-tile" id="share-image">Share Image</button>
      <a class="share-tile" href="${smsHref}">Text</a>
      <button type="button" class="share-tile" id="share-email-toggle">Email</button>
      <button type="button" class="share-tile" id="share-print">Print</button>
      ${canNativeShare ? '<button type="button" class="share-tile" id="share-more">More…</button>' : '<span class="share-tile share-tile--disabled">More…</span>'}
    </div>
    ${state.emailOpen ? `
      <div class="share-panel__email">
        <div class="share-panel__email-title">Email me my itinerary</div>
        <div class="share-panel__email-row">
          <input type="email" id="share-email-input" placeholder="you@example.com" value="${escapeHtml(state.email)}">
          <button type="button" class="email-send-btn ${state.emailSent ? 'email-send-btn--sent' : ''}" id="share-email-send">${state.emailSent ? 'Opened' : 'Send'}</button>
        </div>
        ${state.emailSent ? '<div class="share-panel__sent-note">Your email app should have opened with the itinerary ready to send.</div>' : ''}
      </div>
    ` : ''}
    <div class="share-panel__note">${state.incomingShare ? '' : (navigator.onLine ? `Anyone with this link can see your ${stops.length} ${day} stop${stops.length === 1 ? '' : 's'} in this order.` : 'Offline — the link still works once you have signal.')}</div>
  `;

  document.getElementById('share-close').addEventListener('click', () => {
    state.share = false;
    render();
  });
  document.getElementById('share-image').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.textContent = 'Preparing…';
    btn.disabled = true;
    shareItineraryImage(day, stops, link).finally(() => {
      btn.textContent = original;
      btn.disabled = false;
    });
  });
  document.getElementById('share-copy-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
      window.prompt('Copy this link:', link);
    }
    state.copied = true;
    render();
  });
  document.getElementById('share-email-toggle').addEventListener('click', () => {
    state.emailOpen = !state.emailOpen;
    state.emailSent = false;
    render();
  });
  document.getElementById('share-print').addEventListener('click', () => window.print());
  const moreBtn = document.getElementById('share-more');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      navigator.share({ title: `My AOS Tour plan — ${day}`, text, url: link }).catch(() => {});
    });
  }
  if (state.emailOpen) {
    const emailInput = document.getElementById('share-email-input');
    emailInput.addEventListener('input', (e) => {
      state.email = e.target.value;
      state.emailSent = false;
    });
    document.getElementById('share-email-send').addEventListener('click', () => {
      const subject = encodeURIComponent(`My AOS Tour plan — ${day}`);
      const body = encodeURIComponent(text + '\n\n' + link);
      const to = encodeURIComponent(state.email || '');
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      state.emailSent = true;
      render();
    });
  }
}

function renderPlanView() {
  const day = state.planDay;
  const stops = dayStops(day);
  const satCount = dayStops('Saturday').length;
  const sunCount = dayStops('Sunday').length;

  el.planTitle.textContent = day;
  el.planSummary.textContent = `${stops.length} stop${stops.length === 1 ? '' : 's'} planned`;
  el.dayTabSat.textContent = `Saturday (${satCount})`;
  el.dayTabSun.textContent = `Sunday (${sunCount})`;
  el.dayTabSat.classList.toggle('day-tabs__btn--active', day === 'Saturday');
  el.dayTabSun.classList.toggle('day-tabs__btn--active', day === 'Sunday');

  renderPlanMap(stops);

  const shareBanner = state.incomingShare
    ? `
      <div class="share-incoming">
        <div>Someone shared a ${state.incomingShare.day} plan with ${state.incomingShare.ids.length} stop${state.incomingShare.ids.length === 1 ? '' : 's'} with you.</div>
        <div class="share-incoming__actions">
          <button type="button" class="add-btn" id="share-incoming-add">Add all to my day</button>
          <button type="button" class="link-btn" id="share-incoming-dismiss">Dismiss</button>
        </div>
      </div>
    `
    : '';

  if (stops.length === 0) {
    el.planStops.innerHTML = shareBanner;
    el.planEmpty.hidden = false;
    el.planEmptyTitle.textContent = day === 'Saturday' ? 'Saturday is wide open' : 'Sunday is wide open';
  } else {
    el.planEmpty.hidden = true;
    el.planStops.innerHTML = shareBanner + stops.map((s, i) => planStopRow(s, i, i > 0 ? stops[i - 1] : null, day, stops.length)).join('');
  }

  if (state.incomingShare) {
    const addBtn = document.getElementById('share-incoming-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const share = state.incomingShare;
        share.ids.forEach((id) => {
          if (!isInPlan(id) && findArtist(id)) {
            state.plan.push({ id, day: share.day });
          }
        });
        state.incomingShare = null;
        savePlanToStorage();
        clearShareParamsFromUrl();
        render();
      });
    }
    const dismissBtn = document.getElementById('share-incoming-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        state.incomingShare = null;
        clearShareParamsFromUrl();
        render();
      });
    }
  }

  renderSharePanel(day, stops);
}

function clearShareParamsFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('shareDay');
  url.searchParams.delete('stops');
  window.history.replaceState({}, '', url.toString());
}

// ---------- detail overlay ----------

function openDetail(id) {
  state.detailId = id;
  render();
}

function closeDetail() {
  state.detailId = null;
  render();
}

function renderDetail() {
  const artist = state.detailId !== null ? findArtist(state.detailId) : null;
  el.detailOverlay.hidden = !artist;
  if (!artist) {
    el.detailBody.innerHTML = '';
    el.detailPhoto.innerHTML = '';
    return;
  }

  const name = displayName(artist);
  const imageUrls = artist.imageUrls || [];
  const { memberNames, medium } = listingMeta(artist);
  const inPlan = isInPlan(artist.id);

  el.detailPhoto.classList.toggle('detail-overlay__photo--contain', usesContainPhoto(artist.groupType));
  el.detailPhoto.innerHTML = `
    ${photoMarkup(imageUrls.slice(0, 1), name)}
    <button type="button" class="detail-overlay__back" id="detail-back-inner" aria-label="Back">←</button>
  `;
  document.getElementById('detail-back-inner').addEventListener('click', closeDetail);

  const socialLinks = artist.socialLinks || [];

  el.detailBody.innerHTML = `
    <button type="button" class="link-btn detail-back-link" data-back-to-directory="1">← Back to Directory</button>
    <div class="card__tags">
      ${groupBadgeHtml(artist.groupType, { inline: true })}
      <span class="tag-solid">${escapeHtml(artist.county || '')}</span>
      ${medium ? `<span class="tag-accent">${escapeHtml(medium)}</span>` : ''}
    </div>
    ${artist.veteranLabel ? `<span class="status-ribbon">${escapeHtml(artist.veteranLabel)}</span>` : ''}
    <h2 class="detail-name">${escapeHtml(name)}</h2>
    ${artist.artistBio ? `<p class="detail-bio">${escapeHtml(artist.artistBio)}</p>` : ''}
    ${memberNames.length ? `<p class="card__members"><strong>Artists:</strong> ${escapeHtml(memberNames.join(', '))}</p>` : ''}
    <div class="detail-section"><div class="detail-section__label">AOS Tour Days</div><p>${escapeHtml(artist.aosTourDays || 'Not provided')}</p></div>
    ${artist.studioAddress ? `<div class="detail-section"><div class="detail-section__label">Address</div><p>${escapeHtml(artist.studioAddress)}</p><a class="directions-btn" href="${escapeHtml(directionsUrl(artist.studioAddress))}" target="_blank" rel="noopener">Get Directions</a></div>` : ''}
    ${artist.directionsNotes ? `<div class="detail-section"><div class="detail-section__label">Directions</div><p>${escapeHtml(artist.directionsNotes)}</p></div>` : ''}
    <div class="detail-section"><div class="detail-section__label">Phone</div><p>${artist.phone ? `<a href="tel:${escapeHtml(artist.phone)}">${escapeHtml(artist.phone)}</a>` : 'Not provided'}</p></div>
    ${artist.website ? `<div class="detail-section"><div class="detail-section__label">Website</div><p><a href="${escapeHtml(artist.website)}" target="_blank" rel="noopener">${escapeHtml(artist.website)}</a></p></div>` : ''}
    ${socialLinks.length ? `<div class="detail-section"><div class="detail-section__label">Social Media</div><div class="detail-social-links">${socialLinks.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="detail-social-link">${escapeHtml(socialPlatformLabel(url))} ↗</a>`).join('')}</div></div>` : ''}
    ${artist.accessibilityNotes ? `<div class="detail-section"><div class="detail-section__label">Accessibility Options</div><p>${escapeHtml(artist.accessibilityNotes)}</p></div>` : ''}
    ${photoGalleryHtml(imageUrls, name)}
    <button type="button" class="detail-add-btn ${inPlan ? 'detail-add-btn--active' : ''}" data-add-id="${artist.id}">${inPlan ? '✓ In My Day — remove' : 'Add to My Day'}</button>
  `;
}

// ---------- add-to-day picker ----------

function requestAdd(id) {
  if (isInPlan(id)) {
    state.plan = state.plan.filter((p) => p.id !== id);
    savePlanToStorage();
    render();
    return;
  }
  state.pending = id;
  render();
}

function commitDay(day) {
  if (state.pending === null) return;
  state.plan = state.plan.concat({ id: state.pending, day });
  state.planDay = day;
  state.pending = null;
  savePlanToStorage();
  render();
}

function renderPicker() {
  const artist = state.pending !== null ? findArtist(state.pending) : null;
  el.pickerModal.hidden = !artist;
  if (!artist) return;
  el.pickerNote.textContent = `Add ${displayName(artist)} to Saturday or Sunday?`;
  el.pickerSat.textContent = 'Saturday';
  el.pickerSun.textContent = 'Sunday';
}

// ---------- connection indicator ----------

function renderConnection() {
  const online = navigator.onLine;
  el.connLabel.textContent = online ? 'Online' : 'Offline · cached';
  el.connPill.classList.toggle('conn-pill--offline', !online);
  el.connDot.classList.toggle('conn-pill__dot--offline', !online);
}

// ---------- top-level render ----------

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle('status-message--error', isError);
  el.status.hidden = !message;
}

function isWide() {
  return window.matchMedia(WIDE_QUERY).matches;
}

function render() {
  const filtered = applyFilters();
  const wide = isWide();

  const planCountText = state.plan.length ? `(${state.plan.length})` : '';
  el.planCountLabel.textContent = planCountText;
  el.railPlanCount.textContent = planCountText;

  // Wide layout: list is always visible alongside a persistent rail that
  // switches between Map and My Day. Narrow layout: one of List/Map/My Day
  // at a time, driven by the tab bar.
  const showingMap = wide ? state.railView === 'map' : state.view === 'map';
  const showingPlan = wide ? state.railView === 'plan' : state.view === 'plan';

  renderList(filtered);
  el.grid.hidden = wide ? false : state.view !== 'list';
  document.getElementById('chip-filters').hidden = !wide && state.view === 'plan';
  el.mapView.hidden = !showingMap;
  el.planView.hidden = !showingPlan;

  if (showingMap) {
    showMapView(filtered);
  } else if (mapState.map) {
    renderMapMarkers(filtered);
  }
  if (showingPlan) {
    renderPlanView();
  }

  renderDetail();
  renderPicker();
}

// ---------- event wiring ----------

function wireTabs() {
  el.tabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      el.tabs.forEach((b) => {
        b.classList.toggle('tabs__btn--active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      render();
    });
  });
}

function wireDayTabs() {
  el.dayTabSat.addEventListener('click', () => {
    state.planDay = 'Saturday';
    savePlanToStorage();
    render();
  });
  el.dayTabSun.addEventListener('click', () => {
    state.planDay = 'Sunday';
    savePlanToStorage();
    render();
  });
}

function wireShareButton() {
  el.planShareBtn.addEventListener('click', () => {
    state.share = !state.share;
    state.copied = false;
    render();
  });
}

// Keeps the wide-layout sidebar search box and the narrow-layout chip-filters
// search box showing the same value, without fighting whichever one the
// visitor is actively typing into.
function wireSearchInput(inputEl, otherInputEl) {
  inputEl.addEventListener('input', () => {
    state.filters.search = inputEl.value;
    otherInputEl.value = inputEl.value;
    render();
  });
}

function wireResetFilters() {
  const reset = () => {
    state.filters = { groupType: 'all', county: 'all', medium: 'all', search: '' };
    el.searchInput.value = '';
    el.searchInputSide.value = '';
    renderChips();
    render();
  };
  el.resetFilters.addEventListener('click', reset);
  el.resetFiltersSide.addEventListener('click', reset);
}

function wireRailTabs() {
  el.railTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.railView = btn.dataset.rail;
      el.railTabs.forEach((b) => b.classList.toggle('rail-tabs__btn--active', b === btn));
      render();
    });
  });
}

function wireResponsiveBreakpoint() {
  window.matchMedia(WIDE_QUERY).addEventListener('change', render);
}

// Scrolling happens on `window` at narrow widths (single-column tab layout)
// but inside `containerEl` itself at wide widths (independently scrolling
// sidebar/list/rail columns) — both listeners are attached; only the one
// that's the real scrolling ancestor at any given time ever fires. Pass
// `alwaysContainer: true` for a container that scrolls itself at every
// width (e.g. the detail overlay, a fixed full-viewport panel that never
// hands scrolling off to `window`).
function wireBackToTop(containerEl, buttonEl, threshold = 400, { alwaysContainer = false } = {}) {
  function currentScrollTop() {
    return alwaysContainer || isWide() ? containerEl.scrollTop : window.scrollY;
  }
  function onScroll() {
    buttonEl.hidden = currentScrollTop() <= threshold;
  }
  window.addEventListener('scroll', onScroll);
  containerEl.addEventListener('scroll', onScroll);
  buttonEl.addEventListener('click', () => {
    const target = alwaysContainer || isWide() ? containerEl : window;
    target.scrollTo({ top: 0, behavior: 'instant' });
  });
}

function wirePicker() {
  el.pickerSat.addEventListener('click', () => commitDay('Saturday'));
  el.pickerSun.addEventListener('click', () => commitDay('Sunday'));
  el.pickerCancel.addEventListener('click', () => {
    state.pending = null;
    render();
  });
}

function wireDetailBack() {
  el.detailBack.addEventListener('click', closeDetail);
}

// ---------- install prompt banner ----------

// PWAs don't install automatically, so this nudges visitors toward
// installing it — iOS has no install API at all (Share sheet only).
// Android and desktop Chrome/Edge both expose a real native prompt via
// `beforeinstallprompt` when install criteria are met, but that fires
// async and isn't guaranteed on Android, so a text fallback covers the
// gap there. Desktop only shows the banner once that event actually
// fires — desktop Safari/Firefox never fire it, and UA-sniffing a
// guess for them risks confidently wrong instructions (their install
// paths vary too much to state as fact), so they simply see no banner.
let deferredInstallPrompt = null;

function isRunningStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function detectInstallPlatform() {
  const ua = navigator.userAgent || '';
  // Check Android's unambiguous UA token first — the iPadOS 13+ heuristic
  // below (reporting itself as desktop Mac Safari, distinguishable only by
  // having touch points) is inherently fuzzier and would otherwise
  // false-positive on any touch-capable device whose platform string
  // happens to read "MacIntel".
  if (/Android/.test(ua)) return 'android';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return 'ios';
  // Desktop Chrome/Edge: only recognized once the browser itself confirms
  // installability via this event — no UA guessing needed or wanted.
  if (deferredInstallPrompt) return 'desktop';
  return null;
}

function dismissInstallBanner() {
  el.installBanner.hidden = true;
  localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, '1');
}

function maybeShowInstallBanner() {
  if (isRunningStandalone() || localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)) return;
  const platform = detectInstallPlatform();
  if (!platform) return;

  if (platform === 'ios') {
    el.installBannerText.textContent = 'Install this app: tap your browser\'s Share icon (square with an arrow), then "Add to Home Screen."';
    el.installBannerAction.hidden = true;
  } else if (deferredInstallPrompt) {
    el.installBannerText.textContent = platform === 'desktop'
      ? 'Install this app for quick, one-click access from your desktop.'
      : 'Add this app to your home screen for quick, one-tap access.';
    el.installBannerAction.hidden = false;
  } else {
    el.installBannerText.textContent = 'Install this app: tap the menu (⋮), then "Add to Home Screen" or "Install app."';
    el.installBannerAction.hidden = true;
  }
  el.installBanner.hidden = false;
}

function wireInstallPrompt() {
  el.installBannerDismiss.addEventListener('click', dismissInstallBanner);
  el.installBannerAction.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    dismissInstallBanner();
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    maybeShowInstallBanner();
  });
  maybeShowInstallBanner();
}

// Delegated click handling shared by list cards, plan stop rows, and the
// detail overlay: gallery arrows/dots, opening detail, add/remove/swap.
function setActiveGalleryDot(gallery, index) {
  gallery.querySelectorAll('.gallery__dot').forEach((dot, i) => {
    dot.classList.toggle('gallery__dot--active', i === index);
  });
}

// Distance between slide starts. Slides are equal-width, but on the detail
// view's peek carousel that width is less than the track's own clientWidth,
// so it can't be assumed to equal 100% of the track as it can for the
// card-grid carousel's full-width slides.
function gallerySlideStep(gallery) {
  const slides = gallery.querySelectorAll('.gallery__slide');
  if (slides.length < 2) return gallery.querySelector('.gallery__track')?.clientWidth || 0;
  return slides[1].getBoundingClientRect().left - slides[0].getBoundingClientRect().left;
}

function handleDelegatedClick(e) {
  const arrow = e.target.closest('.gallery__arrow');
  if (arrow) {
    const gallery = arrow.closest('.gallery');
    const track = gallery.querySelector('.gallery__track');
    const step = gallerySlideStep(gallery);
    const dotCount = gallery.querySelectorAll('.gallery__dot').length;
    const currentIndex = step ? Math.round(track.scrollLeft / step) : 0;
    const direction = arrow.classList.contains('gallery__arrow--next') ? 1 : -1;
    const nextIndex = Math.min(Math.max(currentIndex + direction, 0), dotCount - 1);
    track.scrollLeft = nextIndex * step;
    setActiveGalleryDot(gallery, nextIndex);
    return;
  }
  const dot = e.target.closest('.gallery__dot');
  if (dot) {
    const gallery = dot.closest('.gallery');
    const track = gallery.querySelector('.gallery__track');
    const step = gallerySlideStep(gallery);
    const index = [...gallery.querySelectorAll('.gallery__dot')].indexOf(dot);
    track.scrollLeft = index * step;
    setActiveGalleryDot(gallery, index);
    return;
  }
  const addBtn = e.target.closest('[data-add-id]');
  if (addBtn) {
    requestAdd(addBtn.dataset.addId);
    return;
  }
  const swapBtn = e.target.closest('[data-swap-id]');
  if (swapBtn) {
    const id = swapBtn.dataset.swapId;
    const day = swapBtn.dataset.swapTo;
    state.plan = state.plan.map((p) => (p.id === id ? { id, day } : p));
    savePlanToStorage();
    render();
    return;
  }
  const moveBtn = e.target.closest('[data-move-id]');
  if (moveBtn) {
    moveStop(moveBtn.dataset.moveId, Number(moveBtn.dataset.moveDir));
    return;
  }
  const removeBtn = e.target.closest('[data-remove-id]');
  if (removeBtn) {
    const id = removeBtn.dataset.removeId;
    state.plan = state.plan.filter((p) => p.id !== id);
    savePlanToStorage();
    render();
    return;
  }
  const backBtn = e.target.closest('[data-back-to-directory]');
  if (backBtn) {
    backToDirectory();
    return;
  }
  const openBtn = e.target.closest('[data-open-detail]');
  if (openBtn) {
    openDetail(openBtn.dataset.openDetail);
  }
}

function backToDirectory() {
  state.detailId = null;
  state.view = 'list';
  el.tabs.forEach((b) => {
    b.classList.toggle('tabs__btn--active', b.dataset.view === 'list');
    b.setAttribute('aria-selected', b.dataset.view === 'list' ? 'true' : 'false');
  });
  render();
}

function wireGalleryScrollSync(root) {
  root.querySelectorAll('.gallery__track').forEach((track) => {
    track.addEventListener('scroll', () => {
      const gallery = track.closest('.gallery');
      const step = gallerySlideStep(gallery);
      const index = step ? Math.round(track.scrollLeft / step) : 0;
      setActiveGalleryDot(gallery, index);
    });
  });
}

function readIncomingShare() {
  const params = new URLSearchParams(window.location.search);
  const day = params.get('shareDay');
  const stopsParam = params.get('stops');
  if (!day || !stopsParam) return null;
  const ids = stopsParam.split(',').filter(Boolean);
  if (!ids.length) return null;
  return { day: day === 'Sunday' ? 'Sunday' : 'Saturday', ids };
}

// Sheet data is only fetched once, at load (see loadArtists() below). Left
// open — a desktop tab, or an installed phone/tablet app — the page would
// otherwise never notice edits made to the sheet mid-tour. This covers two
// kinds of "left open" visitors: one who's actively looking at the screen
// for a long stretch (the interval), and one who steps away and comes back
// later (the visibility listener, e.g. reopening the installed app).
const DATA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let lastArtistFetchAt = 0;

async function refreshArtistData() {
  if (!navigator.onLine) return;
  try {
    const fresh = await loadArtists();
    assignArtistIds(fresh);
    state.all = fresh;
    lastArtistFetchAt = Date.now();
    render();
  } catch (err) {
    console.error('Background data refresh failed', err);
  }
}

function wireDataAutoRefresh() {
  setInterval(() => {
    if (document.visibilityState === 'visible') refreshArtistData();
  }, DATA_REFRESH_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastArtistFetchAt > DATA_REFRESH_INTERVAL_MS) {
      refreshArtistData();
    }
  });
}

async function init() {
  setStatus('Loading listings…');
  loadPlanFromStorage();
  renderConnection();
  window.addEventListener('online', renderConnection);
  window.addEventListener('offline', renderConnection);
  wireInstallPrompt();

  try {
    state.all = await loadArtists();
    assignArtistIds(state.all);
    lastArtistFetchAt = Date.now();
    wireDataAutoRefresh();

    const incoming = readIncomingShare();
    if (incoming) {
      state.incomingShare = incoming;
      state.view = 'plan';
      state.planDay = incoming.day;
      el.tabs.forEach((b) => {
        b.classList.toggle('tabs__btn--active', b.dataset.view === 'plan');
        b.setAttribute('aria-selected', b.dataset.view === 'plan' ? 'true' : 'false');
      });
    }

    renderChips();
    renderMapLegend();
    wireTabs();
    wireRailTabs();
    wireDayTabs();
    wireShareButton();
    wireResetFilters();
    wireSearchInput(el.searchInput, el.searchInputSide);
    wireSearchInput(el.searchInputSide, el.searchInput);
    wirePicker();
    wireDetailBack();
    wireResponsiveBreakpoint();
    wireBackToTop(el.grid, el.backToTopDirectory);
    wireBackToTop(el.planView, el.backToTopPlan);
    wireBackToTop(el.detailOverlay, el.backToTopDetail, 400, { alwaysContainer: true });
    el.grid.addEventListener('click', handleDelegatedClick);
    el.planStops.addEventListener('click', handleDelegatedClick);
    el.detailBody.addEventListener('click', handleDelegatedClick);
    setStatus('');
    render();
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong loading the tour listings.', true);
  }
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker registration failed:', err));
  });
}
