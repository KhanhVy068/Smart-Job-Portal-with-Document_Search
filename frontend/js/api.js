const API_BASE_URL = localStorage.getItem('apiBaseUrl') || '/api';
const USE_MOCK = localStorage.getItem('useMockApi') === 'true';

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body }),
  put: (url, body) => request(url, { method: 'PUT', body }),
  patch: (url, body) => request(url, { method: 'PATCH', body }),
  delete: (url) => request(url, { method: 'DELETE' })
};

export async function getOptional(url, fallback = null) {
  try {
    return await api.get(url);
  } catch (err) {
    if (err.status === 404) return fallback;
    throw err;
  }
}

async function request(url, options = {}) {
  if (USE_MOCK) {
    return mockRequest(url, options);
  }

  const method = options.method || 'GET';
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

  if (token) headers.set('Authorization', `Bearer ${token}`);

  const fetchOptions = {
    method,
    headers,
    credentials: 'include'
  };

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE_URL}${url}`, fetchOptions);
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    throw createApiError(res, payload);
  }

  return payload;
}

function createApiError(res, payload) {
  const message =
    payload?.message ||
    payload?.error ||
    (typeof payload === 'string' && payload) ||
    `Request failed with status ${res.status}`;

  const err = new Error(message);
  err.status = res.status;
  err.payload = payload;
  return err;
}

function mockRequest(url, options = {}) {
  if ((options.method || 'GET') !== 'GET') {
    console.log('MOCK API:', options.method, url, options.body);
    return { success: true };
  }

  if (url === '/jobs/my' || url === '/jobs') {
    const items = [
      {
        id: 1,
        title: 'Senior UI/UX Designer',
        type: 'Toan thoi gian',
        location: 'Ho Chi Minh',
        createdAt: '2024-05-15',
        status: 'Dang tuyen',
        count: 17,
        views: 420
      },
      {
        id: 2,
        title: 'NodeJS Backend Engineer',
        type: 'Tu xa',
        location: 'Ha Noi',
        createdAt: '2024-05-10',
        status: 'Dang tuyen',
        count: 30,
        views: 512
      },
      {
        id: 3,
        title: 'Growth Marketing Lead',
        type: 'Toan thoi gian',
        location: 'Da Nang',
        createdAt: '2024-05-02',
        status: 'Da dong',
        count: 45,
        views: 236
      }
    ];

    return {
      totalJobs: items.length,
      activeJobs: items.filter(job => isActiveJobStatus(job.status)).length,
      totalCandidates: items.reduce((sum, job) => sum + Number(job.count || 0), 0),
      totalViews: items.reduce((sum, job) => sum + Number(job.views || 0), 0),
      items
    };
  }

  if (
    url === '/applications/my' ||
    url === '/applications' ||
    url.startsWith('/applications?') ||
    /^\/jobs\/[^/]+\/applications$/.test(url)
  ) {
    return [
      {
        id: 1,
        jobId: 1,
        candidateName: 'Nguyen Thi An',
        email: 'an.nguyen@email.com',
        phone: '090 111 2222',
        fileName: 'Nguyen-Thi-An-UIUX.pdf',
        jobTitle: 'Senior UI/UX Designer',
        skills: ['Figma', 'User Research', 'Design System'],
        matchScore: 92,
        status: 'new',
        cvStatus: 'processing',
        createdAt: '2024-06-04T09:30:00Z'
      },
      {
        id: 2,
        jobId: 1,
        candidateName: 'Pham Minh Duc',
        email: 'duc.pham@email.com',
        phone: '091 333 4444',
        fileName: 'Pham-Minh-Duc-Product-Designer.pdf',
        jobTitle: 'Product Designer',
        skills: ['Prototype', 'Dashboard', 'UX Writing'],
        matchScore: 86,
        status: 'viewed',
        cvStatus: 'indexed',
        createdAt: '2024-06-04T08:20:00Z'
      },
      {
        id: 3,
        jobId: 1,
        candidateName: 'Le Hoang Nam',
        email: 'nam.le@email.com',
        phone: '093 555 6666',
        fileName: 'Le-Hoang-Nam-CV.pdf',
        jobTitle: 'Junior Designer',
        skills: ['Wireframe', 'Mobile UI', 'Illustrator'],
        matchScore: 64,
        status: 'new',
        cvStatus: 'rejected',
        createdAt: '2024-06-03T13:05:00Z'
      },
      {
        id: 4,
        jobId: 1,
        candidateName: 'Tran Thu Huong',
        email: 'huong.tran@email.com',
        phone: '097 777 8888',
        fileName: 'Tran-Thu-Huong-UX-Researcher.pdf',
        jobTitle: 'UX Researcher',
        skills: ['Interview', 'Survey', 'Persona'],
        matchScore: 89,
        status: 'interview',
        cvStatus: 'interview',
        createdAt: '2024-06-02T11:10:00Z'
      }
    ];
  }

  if (url === '/candidates/recent' || url === '/candidates') {
    return [
      { id: 1, name: 'Nguyen Thi An', position: 'Senior UI/UX Designer', status: 'new', cvStatus: 'processed', createdAt: '2024-06-04T09:30:00Z' },
      { id: 2, name: 'Pham Minh Duc', position: 'Backend Developer', status: 'viewed', cvStatus: 'processed', createdAt: '2024-06-04T08:20:00Z' },
      { id: 3, name: 'Le Hoang Nam', position: 'Marketing Manager', status: 'new', cvStatus: 'rejected', createdAt: '2024-06-03T13:05:00Z' }
    ];
  }

  return [];
}

function isActiveJobStatus(status = '') {
  const normalized = String(status).toLowerCase();
  return ['active', 'open', 'published', 'dang tuyen', 'dang hien thi'].includes(normalized);
}
