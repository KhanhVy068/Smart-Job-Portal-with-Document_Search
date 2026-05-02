import { getOptional } from '../../api.js';

// Khởi tạo dashboard
export async function init() {
  setDashboardLoading();

  try {
    // Tải dữ liệu nguồn
    const [jobsData, applicationsData, candidatesData] = await Promise.all([
      getOptional('/jobs/my', []),
      getOptional('/applications/my', []),
      getOptional('/candidates/recent', [])
    ]);

    // Chuẩn hóa phản hồi API
    const jobs = normalizeList(jobsData, ['items', 'jobs', 'data']);
    const applications = normalizeList(applicationsData, ['items', 'applications', 'data']);
    const candidates = normalizeList(candidatesData, ['items', 'candidates', 'data']);
    const dashboard = buildDashboardData({ jobs, applications, candidates });

    renderStats(dashboard);
    renderApplicationChart(dashboard.applicationTrend);
    renderActivities(dashboard.recentActivities);
    renderRecentJobs(dashboard.recentJobs);
  } catch (err) {
    console.error('Dashboard error:', err);
    renderDashboardError(err);
  }
}

// Tạo dữ liệu dashboard
function buildDashboardData({ jobs, applications, candidates }) {
  const candidateRecords = applications.length ? applications : candidates;
  const totalCandidates = candidateRecords.length || sumJobsCandidateCount(jobs);
  const processed = countByStatus(candidateRecords, ['processed', 'indexed', 'saved', 'da luu', 'da luu/indexed'], 'cvStatus');
  const rejected = countByStatus(candidateRecords, ['rejected', 'denied', 'bi loai'], 'cvStatus');

  // Dữ liệu tổng hợp
  return {
    jobs: jobs.length,
    candidates: totalCandidates,
    processed,
    rejected,
    applicationTrend: buildApplicationTrend(candidateRecords),
    recentActivities: buildRecentActivities(candidateRecords),
    recentJobs: buildRecentJobs(jobs)
  };
}

// Trạng thái tải
function setDashboardLoading() {
  setText('totalJobs', '--');
  setText('totalCandidates', '--');
  setText('processedCV', '--');
  setText('rejectedCV', '--');

  const activities = document.getElementById('recentActivities');
  if (activities) {
    activities.innerHTML = `
      <div class="p-4 text-sm font-semibold text-slate-400">Dang tai hoat dong gan day...</div>
    `;
  }

  const recentJobs = document.getElementById('recentJobs');
  if (recentJobs) {
    recentJobs.innerHTML = `
      <tr>
        <td class="px-8 py-6 text-sm font-semibold text-slate-400" colspan="5">Dang tai tin tuyen dung...</td>
      </tr>
    `;
  }

  clearApplicationChart();
}

// Render số liệu
function renderStats(data) {
  setText('totalJobs', formatNumber(data.jobs));
  setText('totalCandidates', formatNumber(data.candidates));
  setText('processedCV', formatNumber(data.processed));
  setText('rejectedCV', formatNumber(data.rejected));
}

// Render biểu đồ ứng tuyển
function renderApplicationChart(points) {
  const svg = document.getElementById('applicationChartSvg');
  const labels = document.getElementById('applicationChartLabels');
  const tooltip = document.getElementById('applicationChartTooltip');
  if (!svg || !labels || !tooltip) return;

  const width = 1000;
  const height = 300;
  const paddingX = 28;
  const paddingTop = 28;
  const paddingBottom = 42;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxValue = Math.max(1, ...points.map(point => point.count));

  const coords = points.map((point, index) => {
    const x = paddingX + (index * (width - paddingX * 2)) / Math.max(1, points.length - 1);
    const y = paddingTop + chartHeight - (point.count / maxValue) * chartHeight;
    return { ...point, x, y };
  });

  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  const areaPath = `${linePath} L${coords.at(-1).x},${height - paddingBottom} L${coords[0].x},${height - paddingBottom} Z`;

  labels.innerHTML = points.map(point => `<span>${escapeHtml(point.label)}</span>`).join('');
  svg.innerHTML = `
    <defs>
      <linearGradient id="applicationChartGradient" x1="0%" x2="0%" y1="0%" y2="100%">
        <stop offset="0%" stop-color="#2563eb" stop-opacity="0.22"></stop>
        <stop offset="100%" stop-color="#2563eb" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${[0, 1, 2, 3].map(step => {
      const y = paddingTop + (chartHeight * step) / 3;
      return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="#e2e8f0" stroke-width="1"></line>`;
    }).join('')}
    <path d="${areaPath}" fill="url(#applicationChartGradient)"></path>
    <path d="${linePath}" fill="none" stroke="#2563eb" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"></path>
  `;

  coords.forEach((point) => {
    const circle = createSvgElement('circle', {
      cx: point.x,
      cy: point.y,
      r: 7,
      fill: '#ffffff',
      stroke: '#2563eb',
      'stroke-width': 4,
      class: 'cursor-pointer'
    });

    circle.addEventListener('mouseenter', () => showChartTooltip(tooltip, point));
    circle.addEventListener('mousemove', (event) => moveChartTooltip(tooltip, event));
    circle.addEventListener('mouseleave', () => hideChartTooltip(tooltip));
    svg.appendChild(circle);
  });
}

// Xóa biểu đồ
function clearApplicationChart() {
  const svg = document.getElementById('applicationChartSvg');
  const labels = document.getElementById('applicationChartLabels');
  const tooltip = document.getElementById('applicationChartTooltip');

  if (svg) svg.innerHTML = '';
  if (labels) labels.innerHTML = '';
  if (tooltip) tooltip.classList.add('hidden');
}

// Render hoạt động gần đây
function renderActivities(items) {
  const target = document.getElementById('recentActivities');
  if (!target) return;

  if (!items.length) {
    target.innerHTML = `<div class="p-4 text-sm font-semibold text-slate-400">Chua co hoat dong moi.</div>`;
    return;
  }

  target.innerHTML = items.map(item => `
    <div class="flex items-center gap-4 rounded-lg p-4 hover:bg-slate-50">
      <div class="flex h-11 w-11 items-center justify-center rounded-full ${item.avatarClass} font-black">
        ${escapeHtml(item.initials)}
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-base font-black text-slate-950">${escapeHtml(item.name)}</p>
        <p class="truncate text-sm text-slate-500">${escapeHtml(item.position)}</p>
      </div>
      <div class="text-right">
        <p class="text-xs font-black text-slate-400">${escapeHtml(item.time)}</p>
        <span class="rounded px-2 py-1 text-[10px] font-black ${getActivityBadgeClass(item.status)}">
          ${escapeHtml(item.status)}
        </span>
      </div>
    </div>
  `).join('');
}

// Render tin tuyển dụng
function renderRecentJobs(jobs) {
  const target = document.getElementById('recentJobs');
  if (!target) return;

  if (!jobs.length) {
    target.innerHTML = `
      <tr>
        <td class="px-8 py-6 text-sm font-semibold text-slate-400" colspan="5">Chua co tin tuyen dung.</td>
      </tr>
    `;
    return;
  }

  target.innerHTML = jobs.map(job => `
    <tr class="hover:bg-slate-50">
      <td class="px-8 py-5">
        <button class="flex items-center gap-4 text-left" data-job-id="${job.id || ''}" data-route="job-detail">
          <span class="flex h-10 w-10 items-center justify-center rounded-lg ${job.iconClass} text-sm font-black">
            ${escapeHtml(job.shortName)}
          </span>
          <span>
            <span class="block font-black text-slate-950">${escapeHtml(job.title)}</span>
            <span class="block text-sm text-slate-500">${escapeHtml(job.type)} - ${escapeHtml(job.location)}</span>
          </span>
        </button>
      </td>
      <td class="px-8 py-5">
        <span class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-black">${formatNumber(job.count)}</span>
      </td>
      <td class="px-8 py-5 font-semibold text-slate-600">${escapeHtml(job.createdAt)}</td>
      <td class="px-8 py-5">
        <span class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${getJobStatusClass(job.status)}">
          <span class="h-2 w-2 rounded-full ${getJobStatusDotClass(job.status)}"></span>
          ${escapeHtml(job.statusLabel)}
        </span>
      </td>
      <td class="px-8 py-5 text-right">
        <button class="text-slate-400 hover:text-blue-600" data-job-id="${job.id || ''}" data-route="job-detail" aria-label="Xem chi tiet tin">
          <span class="material-symbols-outlined">more_vert</span>
        </button>
      </td>
    </tr>
  `).join('');

  target.querySelectorAll('[data-job-id]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.jobId) {
        sessionStorage.setItem('selectedJobId', button.dataset.jobId);
      }
    });
  });
}

// Tạo dữ liệu biểu đồ
function buildApplicationTrend(records) {
  const buckets = getLastSevenDayBuckets();

  records.forEach((record) => {
    const timestamp = toTime(record.createdAt || record.appliedAt || record.submittedAt);
    if (!timestamp) return;

    const key = toDateKey(new Date(timestamp));
    if (buckets.has(key)) {
      buckets.get(key).count += 1;
    }
  });

  return Array.from(buckets.values());
}

// Tạo danh sách hoạt động
function buildRecentActivities(records) {
  return records
    .slice()
    .sort((a, b) => toTime(b.createdAt || b.appliedAt) - toTime(a.createdAt || a.appliedAt))
    .slice(0, 4)
    .map((item, index) => {
      const name = item.candidateName || item.name || item.fullName || 'Ung vien';
      const status = normalizeActivityStatus(item.status);

      return {
        name,
        initials: getInitials(name),
        position: item.jobTitle || item.position || item.currentPosition || 'Ung vien',
        time: formatRelativeTime(item.createdAt || item.appliedAt),
        status,
        avatarClass: getAvatarClass(index)
      };
    });
}

// Tooltip biểu đồ
function showChartTooltip(tooltip, point) {
  tooltip.innerHTML = `
    <div>${escapeHtml(point.fullLabel)}</div>
    <div class="mt-1 text-blue-100">${formatNumber(point.count)} ung tuyen</div>
  `;
  tooltip.classList.remove('hidden');
}

function moveChartTooltip(tooltip, event) {
  const container = document.getElementById('applicationChart');
  if (!container) return;

  const rect = container.getBoundingClientRect();
  tooltip.style.left = `${event.clientX - rect.left + 12}px`;
  tooltip.style.top = `${event.clientY - rect.top - 44}px`;
}

function hideChartTooltip(tooltip) {
  tooltip.classList.add('hidden');
}

// Tạo phần tử SVG
function createSvgElement(tagName, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);

  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });

  return element;
}

// Tạo danh sách tin mới
function buildRecentJobs(jobs) {
  return jobs
    .slice()
    .sort((a, b) => toTime(b.createdAt || b.publishedAt) - toTime(a.createdAt || a.publishedAt))
    .slice(0, 3)
    .map((job, index) => ({
      id: job.id || job._id,
      title: job.title || job.name || 'Tin tuyen dung',
      shortName: job.shortName || getShortName(job.title || job.name),
      type: job.type || job.employmentType || 'Toan thoi gian',
      location: job.location || job.city || 'Chua cap nhat',
      count: Number(job.count ?? job.cvCount ?? job.applicationCount ?? job.applicationsCount ?? 0),
      createdAt: formatDate(job.createdAt || job.publishedAt),
      status: normalizeJobStatus(job.status),
      statusLabel: getJobStatusLabel(job.status),
      iconClass: getJobIconClass(index)
    }));
}

// Chuẩn hóa danh sách
function normalizeList(payload, keys) {
  if (Array.isArray(payload)) return payload;

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }

  return [];
}

// Tổng ứng viên theo tin
function sumJobsCandidateCount(jobs) {
  return jobs.reduce((sum, job) => (
    sum + Number(job.count ?? job.cvCount ?? job.applicationCount ?? job.applicationsCount ?? 0)
  ), 0);
}

// Đếm theo trạng thái
function countByStatus(records, acceptedStatuses, field) {
  const accepted = new Set(acceptedStatuses);

  return records.filter(record => {
    const rawStatus = record[field] || record.status || record.cv?.status;
    return accepted.has(normalizeStatus(rawStatus));
  }).length;
}

// Chuẩn hóa trạng thái
function normalizeStatus(status = '') {
  return String(status).trim().toLowerCase();
}

function normalizeActivityStatus(status = '') {
  const normalized = normalizeStatus(status);
  if (['new', 'moi', 'pending'].includes(normalized)) return 'Moi';
  if (['viewed', 'da xem', 'reviewed'].includes(normalized)) return 'Da xem';
  if (['interview', 'phong van'].includes(normalized)) return 'Phong van';
  if (['rejected', 'bi loai'].includes(normalized)) return 'Bi loai';
  return status || 'Moi';
}

function normalizeJobStatus(status = '') {
  const normalized = normalizeStatus(status);
  if (['active', 'open', 'published', 'dang tuyen', 'dang hien thi'].includes(normalized)) return 'active';
  if (['closed', 'inactive', 'da dong'].includes(normalized)) return 'closed';
  return 'draft';
}

function getJobStatusLabel(status = '') {
  const normalized = normalizeJobStatus(status);
  if (normalized === 'active') return 'Dang hien thi';
  if (normalized === 'closed') return 'Da dong';
  return 'Nhap';
}

// Hiển thị lỗi
function renderDashboardError(err) {
  const target = document.getElementById('recentActivities');
  if (!target) return;

  target.innerHTML = `
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
      Khong tai duoc dashboard: ${escapeHtml(err.message || 'Unknown error')}
    </div>
  `;
}

// Gán text
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Định dạng số
function formatNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

// Định dạng ngày
function formatDate(value) {
  if (!value) return 'Chua cap nhat';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('vi-VN');
}

// Định dạng thời gian tương đối
function formatRelativeTime(value) {
  const timestamp = toTime(value);
  if (!timestamp) return 'Chua cap nhat';

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes || 1} phut truoc`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} gio truoc`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hom qua';
  return `${diffDays} ngay truoc`;
}

// Tạo mốc 7 ngày
function getLastSevenDayBuckets() {
  const formatter = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' });
  const buckets = new Map();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);

    buckets.set(toDateKey(date), {
      key: toDateKey(date),
      label: formatter.format(date),
      fullLabel: date.toLocaleDateString('vi-VN'),
      count: 0
    });
  }

  return buckets;
}

// Khóa ngày
function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Chuyển sang timestamp
function toTime(value) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

// Tên viết tắt tin
function getShortName(title = '') {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase())
    .join('') || 'JD';
}

// Tên viết tắt ứng viên
function getInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map(word => word[0]?.toUpperCase())
    .join('') || '?';
}

// Màu trạng thái hoạt động
function getActivityBadgeClass(status) {
  if (status === 'Moi') return 'bg-green-50 text-green-600';
  if (status === 'Da xem') return 'bg-blue-50 text-blue-600';
  if (status === 'Bi loai') return 'bg-rose-50 text-rose-600';
  return 'bg-slate-100 text-slate-600';
}

// Màu trạng thái tin
function getJobStatusClass(status) {
  if (status === 'active') return 'bg-green-50 text-green-700';
  if (status === 'closed') return 'bg-slate-100 text-slate-600';
  return 'bg-orange-50 text-orange-700';
}

// Màu chấm trạng thái tin
function getJobStatusDotClass(status) {
  if (status === 'active') return 'bg-green-600';
  if (status === 'closed') return 'bg-slate-400';
  return 'bg-orange-500';
}

// Màu avatar
function getAvatarClass(index) {
  return [
    'bg-blue-50 text-blue-600',
    'bg-cyan-50 text-cyan-700',
    'bg-slate-200 text-slate-500',
    'bg-purple-50 text-purple-600'
  ][index % 4];
}

// Màu icon tin
function getJobIconClass(index) {
  return [
    'bg-blue-50 text-blue-600',
    'bg-orange-50 text-orange-600',
    'bg-purple-50 text-purple-600'
  ][index % 3];
}

// Escape HTML
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
