// Anonymous usage counts (Plausible) so the tour can show funders that people
// actually use the app. Nothing personal is ever sent: no names, emails, phone
// numbers, search text, or plan contents — only event names like "Add to My
// Day" with a type/day label. Plausible itself keeps no cookies and stores no
// personal data; it counts unique visitors from a daily-rotating hash.
//
// Sends only from the live site (so local testing and Netlify preview deploys
// never pollute the numbers) and skips visitors whose browser says Do Not Track.
// Events fired with no signal are queued on the device and sent when it's back,
// since much of the tour happens in studios with poor reception.

const ANALYTICS_DOMAIN = 'directory.artistopenstudios.com';
const ANALYTICS_ENDPOINT = 'https://plausible.io/api/event';
const ANALYTICS_QUEUE_KEY = 'aosAnalyticsQueueV1';
const ANALYTICS_QUEUE_MAX = 200;

function analyticsEnabled() {
  return window.location.hostname === ANALYTICS_DOMAIN && navigator.doNotTrack !== '1';
}

function readAnalyticsQueue() {
  try {
    return JSON.parse(localStorage.getItem(ANALYTICS_QUEUE_KEY)) || [];
  } catch (err) {
    return [];
  }
}

function writeAnalyticsQueue(queue) {
  try {
    localStorage.setItem(ANALYTICS_QUEUE_KEY, JSON.stringify(queue.slice(-ANALYTICS_QUEUE_MAX)));
  } catch (err) {
    // Storage full or unavailable — usage counts are best-effort.
  }
}

function sendAnalyticsEvent(payload) {
  // text/plain keeps this a "simple" cross-origin request (no preflight).
  return fetch(ANALYTICS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) throw new Error(`Analytics HTTP ${response.status}`);
  });
}

// Never throws and never blocks the app: tracking is strictly best-effort.
function track(name, props) {
  try {
    if (!analyticsEnabled()) return;
    const payload = {
      name,
      // Query string dropped on purpose: shared links carry listing ids.
      url: window.location.origin + window.location.pathname,
      domain: ANALYTICS_DOMAIN,
      referrer: document.referrer || undefined,
      props: Object.assign({ mode: isRunningStandalone() ? 'installed app' : 'browser' }, props),
    };
    if (!navigator.onLine) {
      writeAnalyticsQueue(readAnalyticsQueue().concat(payload));
      return;
    }
    sendAnalyticsEvent(payload).catch(() => {
      writeAnalyticsQueue(readAnalyticsQueue().concat(payload));
    });
  } catch (err) {
    // ignore
  }
}

function flushAnalyticsQueue() {
  try {
    if (!analyticsEnabled() || !navigator.onLine) return;
    const queue = readAnalyticsQueue();
    if (!queue.length) return;
    // Clear first so events fired while flushing aren't lost or doubled;
    // anything that fails to send is put back.
    writeAnalyticsQueue([]);
    queue.forEach((payload) => {
      sendAnalyticsEvent(payload).catch(() => {
        writeAnalyticsQueue(readAnalyticsQueue().concat(payload));
      });
    });
  } catch (err) {
    // ignore
  }
}

window.addEventListener('online', flushAnalyticsQueue);
