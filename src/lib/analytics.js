const STORAGE_KEY = 'shiftzero_analytics_v1';
const SESSION_KEY = 'shiftzero_session_v1';

function emptyAnalytics() {
  return {
    totalVisitors: 0,
    totalSessions: 0,
    totalDwellMs: 0,
    downloadClicks: 0,
    downloads: 0,
    byCountry: {},
    bySoftware: {},
    blogViews: {},
    recentEvents: []
  };
}

export function loadAnalytics() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyAnalytics();
    return { ...emptyAnalytics(), ...JSON.parse(raw) };
  } catch {
    return emptyAnalytics();
  }
}

function saveAnalytics(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

function pushEvent(data, event) {
  data.recentEvents = [
    { ...event, at: new Date().toISOString() },
    ...(data.recentEvents || [])
  ].slice(0, 40);
}

function ensureSoftware(data, productId, name) {
  if (!data.bySoftware[productId]) {
    data.bySoftware[productId] = {
      name: name || productId,
      clicks: 0,
      downloads: 0,
      byCountry: {}
    };
  } else if (name) {
    data.bySoftware[productId].name = name;
  }
  return data.bySoftware[productId];
}

async function detectCountry() {
  try {
    const cached = sessionStorage.getItem('sz_country');
    if (cached) return cached;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
    const res = await fetch('https://ipapi.co/json/', controller ? { signal: controller.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (!res.ok) throw new Error('geo fail');
    const json = await res.json();
    const country = json.country_name || json.country || 'Unknown';
    sessionStorage.setItem('sz_country', country);
    return country;
  } catch {
    return 'Unknown';
  }
}

export async function trackVisit() {
  const data = loadAnalytics();
  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    session = null;
  }

  if (!session) {
    const country = await detectCountry();
    session = { id: `s_${Date.now()}`, start: Date.now(), country };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    data.totalVisitors += 1;
    data.totalSessions += 1;
    data.byCountry[country] = (data.byCountry[country] || 0) + 1;
    pushEvent(data, { type: 'visit', country, label: 'New visitor' });
    saveAnalytics(data);
  }

  return { data: loadAnalytics(), session };
}

export function trackDwellHeartbeat() {
  let session = null;
  try {
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return loadAnalytics();
  }
  if (!session?.start) return loadAnalytics();

  const data = loadAnalytics();
  const now = Date.now();
  const last = session.lastBeat || session.start;
  const delta = Math.min(Math.max(now - last, 0), 60000);
  data.totalDwellMs += delta;
  session.lastBeat = now;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return saveAnalytics(data);
}

export async function trackDownloadClick(productId, productName) {
  const country = await detectCountry();
  const data = loadAnalytics();
  const soft = ensureSoftware(data, productId, productName);
  soft.clicks += 1;
  soft.byCountry[country] = (soft.byCountry[country] || 0) + 1;
  data.downloadClicks += 1;
  pushEvent(data, {
    type: 'download_click',
    country,
    productId,
    label: `Click · ${productName || productId}`
  });
  return saveAnalytics(data);
}

export async function trackDownloadStart(productId, productName, fileLabel) {
  const country = await detectCountry();
  const data = loadAnalytics();
  const soft = ensureSoftware(data, productId, productName);
  soft.downloads += 1;
  soft.byCountry[country] = (soft.byCountry[country] || 0) + 1;
  data.downloads += 1;
  pushEvent(data, {
    type: 'download',
    country,
    productId,
    label: fileLabel || `Download · ${productName || productId}`
  });
  return saveAnalytics(data);
}

export function trackBlogView(blogId, title) {
  const data = loadAnalytics();
  data.blogViews[blogId] = (data.blogViews[blogId] || 0) + 1;
  pushEvent(data, {
    type: 'blog_view',
    label: `View · ${title || blogId}`
  });
  return saveAnalytics(data);
}

export function formatDwell(ms) {
  const totalSec = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function countryBreakdown(byCountry = {}) {
  const entries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1;
  return entries.map(([country, count]) => ({
    country,
    count,
    pct: `${Math.round((count / total) * 100)}%`
  }));
}
