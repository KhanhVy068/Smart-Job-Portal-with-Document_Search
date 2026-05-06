import { api } from '../../api.js';

// API thật dự kiến: GET /admin/search-analytics?range=&startDate=&endDate=
// Backend có thể trả overview, trends, topKeywords, noResults,
// filtersUsage, hành vi, ctr, applyConversion và table.
const endpoint = '/admin/search-analytics';

const state = {
  range: '7d',
  startDate: '',
  endDate: ''
};

export async function init() {
  bindEvents();
  renderLoading();
  await loadAnalytics();
}

function bindEvents() {
  document.querySelectorAll('.dateRangeButton').forEach((button) => {
    button.addEventListener('click', () => {
      state.range = button.dataset.range;
      state.startDate = '';
      state.endDate = '';
      setActiveRangeButton();
      loadAnalytics();
    });
  });

  document.getElementById('btnApplySearchDate')?.addEventListener('click', () => {
    state.range = 'custom';
    state.startDate = document.getElementById('searchStartDate')?.value || '';
    state.endDate = document.getElementById('searchEndDate')?.value || '';
    setActiveRangeButton();
    loadAnalytics();
  });

  document.getElementById('btnReloadSearchAnalytics')?.addEventListener('click', () => loadAnalytics());
}

async function loadAnalytics() {
  setText('searchAnalyticsSubtitle', 'Loading dữ liệu phân tích tìm kiếm từ backend...');

  try {
    const payload = await api.get(`${endpoint}?${buildQuery()}`);
    renderAnalytics(normalizeAnalytics(payload));
    setText('searchAnalyticsSubtitle', 'Dữ liệu phân tích tìm kiếm được tải theo bộ lọc ngày hiện tại.');
  } catch (err) {
    console.error('Search analytics error:', err);
    renderAnalytics(normalizeAnalytics({}));
    setText(
      'searchAnalyticsSubtitle',
      err?.status === 404
        ? 'Backend chưa có endpoint /admin/search-analytics. Frontend đã sẵn sàng để nối dữ liệu thật.'
        : 'Không tải được dữ liệu phân tích tìm kiếm từ backend.'
    );
  }
}

function renderLoading() {
  renderList('topKeywordsList', emptyBlock('Loading từ khóa...'));
  renderList('noResultKeywordsList', emptyBlock('Loading từ khóa không có kết quả...'));
  renderList('searchAnalyticsTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="6">Loading phân tích...</td></tr>');
}

function normalizeAnalytics(payload = {}) {
  const overview = payload.overview || payload.stats || {};
  const filters = payload.filtersUsage || payload.filters || {};
  const behavior = payload.behavior || payload.searchBehavior || {};

  return {
    overview: {
      totalSearches: numberValue(overview.totalSearches ?? payload.totalSearches),
      uniqueUsers: numberValue(overview.uniqueUsers ?? overview.uniqueUsersSearch ?? payload.uniqueUsers),
      searchesToday: numberValue(overview.searchesToday ?? payload.searchesToday),
      noResultSearches: numberValue(overview.noResultSearches ?? overview.noResults ?? payload.noResultSearches)
    },
    trends: normalizeSeries(payload.trends || payload.searchTrends || payload.searchesOverTime),
    topKeywords: normalizeArray(payload.topKeywords || payload.keywords),
    noResults: normalizeArray(payload.noResults || payload.noResultKeywords),
    filtersUsage: {
      locations: normalizeArray(filters.locations || filters.location),
      salaries: normalizeArray(filters.salaries || filters.salaryRanges || filters.salary),
      experiences: normalizeArray(filters.experiences || filters.experienceLevels || filters.experience)
    },
    behavior: {
      avgKeywordLength: numberValue(behavior.avgKeywordLength ?? behavior.averageKeywordLength),
      repeatSearches: numberValue(behavior.repeatSearches),
      clicksAfterSearch: numberValue(behavior.clicksAfterSearch)
    },
    ctr: numberValue(payload.ctr ?? payload.clickThroughRate ?? overview.ctr),
    applyConversion: numberValue(payload.applyConversion ?? payload.searchApplyConversion ?? overview.applyConversion),
    table: normalizeArray(payload.table || payload.analytics || payload.rows)
  };
}

function renderAnalytics(data) {
  renderOverview(data.overview);
  renderTrend(data.trends);
  renderKeywordList('topKeywordsList', data.topKeywords, 'search');
  renderKeywordList('noResultKeywordsList', data.noResults, 'search_off');
  renderFilters(data.filtersUsage);
  renderBehavior(data.behavior);
  renderConversion(data.ctr, data.applyConversion);
  renderTable(data.table);
}

// Render các card tổng quan nhanh.
function renderOverview(overview) {
  setText('totalSearches', formatNumber(overview.totalSearches));
  setText('uniqueSearchUsers', formatNumber(overview.uniqueUsers));
  setText('searchesToday', formatNumber(overview.searchesToday));
  setText('noResultSearches', formatNumber(overview.noResultSearches));
}

// Render biểu đồ xu hướng search bằng SVG, không phụ thuộc thư viện ngoài.
function renderTrend(series) {
  const svg = document.getElementById('searchTrendSvg');
  const labels = document.getElementById('searchTrendLabels');
  const empty = document.getElementById('searchTrendEmpty');
  if (!svg || !labels || !empty) return;

  svg.innerHTML = '';
  labels.innerHTML = '';
  const points = series.filter((item) => Number.isFinite(item.value));
  const hasData = points.length > 0;
  empty.classList.toggle('hidden', hasData);
  empty.classList.toggle('flex', !hasData);
  setText('searchTrendTotal', `${formatNumber(points.reduce((sum, item) => sum + item.value, 0))} lượt tìm kiếm`);
  if (!hasData) return;

  const width = 1000;
  const height = 280;
  const max = Math.max(...points.map((item) => item.value), 1);
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map((item, index) => ({
    x: points.length > 1 ? index * step : width / 2,
    y: height - (item.value / max) * 220 - 30,
    ...item
  }));

  const grid = [50, 100, 150, 200, 250]
    .map((y) => `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`)
    .join('');
  const polyline = coords.map((point) => `${point.x},${point.y}`).join(' ');
  const circles = coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" fill="#2563eb"><title>${escapeHtml(point.label)}: ${formatNumber(point.value)}</title></circle>`).join('');

  svg.innerHTML = `
    ${grid}
    <polyline fill="none" stroke="#2563eb" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
    ${circles}
  `;

  const visibleLabels = coords.length > 8
    ? [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]]
    : coords;
  labels.innerHTML = visibleLabels.map((item) => `<span>${escapeHtml(shortLabel(item.label))}</span>`).join('');
}

// Render Top Keywords và No-result Keywords.
function renderKeywordList(targetId, items, icon) {
  if (!items.length) {
    renderList(targetId, emptyBlock('Chưa có dữ liệu keyword.'));
    return;
  }

  const max = Math.max(...items.map((item) => Number(item.count || item.value || 0)), 1);
  renderList(targetId, items.slice(0, 8).map((item) => {
    const keyword = item.keyword || item.term || item.name || '--';
    const count = Number(item.count || item.value || 0);
    const resultCount = Number(item.resultCount ?? item.results ?? 0);
    return `
      <div class="py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <span class="material-symbols-outlined text-xl text-slate-400">${icon}</span>
            <p class="truncate text-sm font-black text-slate-950">${escapeHtml(keyword)}</p>
          </div>
          <span class="text-sm font-black text-slate-900">${formatNumber(count)}</span>
        </div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full bg-blue-600" style="width:${Math.max((count / max) * 100, 4)}%"></div>
        </div>
        <p class="mt-1 text-xs font-bold text-slate-400">${formatNumber(resultCount)} results</p>
      </div>
    `;
  }).join(''));
}

function renderFilters(filters) {
  renderFilterList('locationFiltersList', filters.locations);
  renderFilterList('salaryFiltersList', filters.salaries);
  renderFilterList('experienceFiltersList', filters.experiences);
}

function renderFilterList(targetId, items) {
  if (!items.length) {
    renderList(targetId, '<p class="text-sm font-bold text-slate-400">Chưa có dữ liệu.</p>');
    return;
  }

  renderList(targetId, items.slice(0, 5).map((item) => `
    <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <span class="truncate text-sm font-bold text-slate-600">${escapeHtml(item.label || item.name || item.value || '--')}</span>
      <span class="text-sm font-black text-slate-950">${formatNumber(item.count || item.total || 0)}</span>
    </div>
  `).join(''));
}

function renderBehavior(behavior) {
  setText('avgKeywordLength', Number.isFinite(behavior.avgKeywordLength) ? `${behavior.avgKeywordLength.toFixed(1)} ký tự` : '--');
  setText('repeatSearches', formatNumber(behavior.repeatSearches));
  setText('clicksAfterSearch', formatNumber(behavior.clicksAfterSearch));
}

function renderConversion(ctr, applyConversion) {
  const ctrPercent = normalizePercent(ctr);
  const applyPercent = normalizePercent(applyConversion);
  setText('searchCtrText', Number.isFinite(ctrPercent) ? `${ctrPercent.toFixed(1)}%` : '--');
  setText('searchApplyText', Number.isFinite(applyPercent) ? `${applyPercent.toFixed(1)}%` : '--');
  setBar('searchCtrBar', ctrPercent);
  setBar('searchApplyBar', applyPercent);
}

// Render bảng chi tiết: Keyword, Count, Result count, Clicks, CTR, Chuyển đổi hồ sơ ứng tuyển.
function renderTable(items) {
  if (!items.length) {
    renderList('searchAnalyticsTableBody', '<tr><td class="px-4 py-8 text-center text-sm font-bold text-slate-400" colspan="6">Chưa có dữ liệu analytics.</td></tr>');
    return;
  }

  renderList('searchAnalyticsTableBody', items.slice(0, 30).map((item) => {
    const count = Number(item.count || item.searchCount || 0);
    const clicks = Number(item.clicks || item.clickCount || 0);
    const ctr = item.ctr ?? (count > 0 ? (clicks / count) * 100 : null);
    return `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-4 text-sm font-black text-slate-950">${escapeHtml(item.keyword || item.term || '--')}</td>
        <td class="px-4 py-4 text-sm font-semibold text-slate-600">${formatNumber(count)}</td>
        <td class="px-4 py-4 text-sm font-semibold text-slate-600">${formatNumber(item.resultCount ?? item.results ?? 0)}</td>
        <td class="px-4 py-4 text-sm font-semibold text-slate-600">${formatNumber(clicks)}</td>
        <td class="px-4 py-4 text-sm font-black text-slate-900">${formatPercent(ctr)}</td>
        <td class="px-4 py-4 text-sm font-black text-slate-900">${formatPercent(item.applyConversion ?? item.conversion)}</td>
      </tr>
    `;
  }).join(''));
}

function buildQuery() {
  const params = new URLSearchParams();
  params.set('range', state.range);
  if (state.startDate) params.set('startDate', state.startDate);
  if (state.endDate) params.set('endDate', state.endDate);
  return params.toString();
}

function setActiveRangeButton() {
  document.querySelectorAll('.dateRangeButton').forEach((button) => {
    const active = button.dataset.range === state.range;
    button.classList.toggle('bg-blue-600', active);
    button.classList.toggle('text-white', active);
    button.classList.toggle('text-slate-600', !active);
    button.classList.toggle('hover:bg-slate-50', !active);
  });
}

function normalizeSeries(value) {
  return normalizeArray(value).map((item) => ({
    label: item.label || item.date || item.month || item.day || '',
    value: numberValue(item.value ?? item.count ?? item.total)
  }));
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number <= 1 ? number * 100 : number;
}

function formatPercent(value) {
  const percent = normalizePercent(value);
  return Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '--';
}

function setBar(id, percent) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.width = Number.isFinite(percent) ? `${Math.min(Math.max(percent, 0), 100)}%` : '0%';
}

function shortLabel(value = '') {
  const text = String(value);
  return text.length > 10 ? text.slice(0, 10) : text;
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : '--';
}

function emptyBlock(message) {
  return `<p class="py-8 text-center text-sm font-bold text-slate-400">${escapeHtml(message)}</p>`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderList(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}















