// Cấu hình URL API và chế độ mock từ localStorage.
const API_BASE_URL = localStorage.getItem('apiBaseUrl') || 'http://localhost:5000/api';
const USE_MOCK = localStorage.getItem('useMockApi') === 'true';

// Gom các hàm gọi API thường dùng để các trang import lại.
export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body }),
  put: (url, body) => request(url, { method: 'PUT', body }),
  patch: (url, body) => request(url, { method: 'PATCH', body }),
  delete: (url) => request(url, { method: 'DELETE' }),
  upload: (url, formData) => request(url, { method: 'POST', _formData: formData })
};

// Gọi API tùy chọn: nếu 404 thì trả về giá trị dự phòng.
export async function getOptional(url, fallback = null) {
  try {
    return await api.get(url);
  } catch (err) {
    if (err.status === 404) return fallback;
    throw err;
  }
}

// Hàm gọi API chính: gắn token, gửi body JSON và xử lý response.
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
    headers
  };

  if (options._formData !== undefined) {
    fetchOptions.body = options._formData;
    // Let browser set Content-Type with boundary for multipart
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE_URL}${url}`, fetchOptions);
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    throw createApiError(res, payload);
  }

  return fixMojibakeDeep(payload);
}

// Chuẩn hóa lỗi từ backend thành Error có status và payload.
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

function fixMojibakeDeep(value) {
  if (typeof value === 'string') return fixMojibake(value);
  if (Array.isArray(value)) return value.map(fixMojibakeDeep);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, fixMojibakeDeep(item)])
  );
}

function fixMojibake(value = '') {
  const text = String(value);
  const looksBroken =
    text.includes('Ã') ||
    text.includes('Â') ||
    text.includes('Ä') ||
    text.includes('Æ') ||
    text.includes('áº') ||
    text.includes('á»') ||
    text.includes('à¡') ||
    text.includes('â');
  if (!looksBroken) return text;

  try {
    const bytes = Uint8Array.from([...text].map(char => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return decoded.includes('\uFFFD') ? text : decoded;
  } catch {
    return text;
  }
}

// Dữ liệu giả dùng khi bật useMockApi để test giao diện không cần backend.
function mockRequest(url, options = {}) {
  if ((options.method || 'GET') !== 'GET') {
    console.log('MOCK API:', options.method, url, options.body);
    if (url === '/auth/login') {
      const role = options.body?.role || 'candidate';
      return {
        accessToken: 'mock-token-123',
        role,
        user: { id: 1, fullName: 'Nguyễn Văn An', email: options.body?.identifier || 'demo@nexus.com', role }
      };
    }
    if (url === '/auth/register') return { success: true, message: 'Đăng ký thành công.' };
    if (url === '/auth/forgot-password') return { success: true, message: 'Email đã được gửi.' };
    if (/^\/jobs\/\d+\/apply$/.test(url)) return { success: true, message: 'Ứng tuyển thành công.' };
    if (url === '/candidate/cv/upload' || url === '/candidate/cv/upload/') {
      return { id: Date.now(), filename: 'uploaded_cv.pdf', status: 'processing', uploadedAt: new Date().toISOString() };
    }
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

  // ── Candidate profile ──────────────────────────────────────────────────
  if (url === '/user/profile') {
    return {
      id: 1,
      fullName: 'Nguyễn Văn An',
      email: 'an.nguyen@email.com',
      phone: '090 123 4567',
      title: 'Senior Frontend Developer',
      location: 'TP. Hồ Chí Minh',
      bio: 'Kỹ sư Frontend với 5 năm kinh nghiệm xây dựng ứng dụng web hiệu suất cao.',
      skills: ['React', 'TypeScript', 'Tailwind CSS', 'Node.js', 'Elasticsearch'],
      experience: 5,
      education: 'Đại học Bách Khoa TP.HCM – Kỹ thuật Phần mềm',
      avatar: '',
      profileStrength: 85,
    };
  }

  // ── Candidate applications ─────────────────────────────────────────────
  if (url === '/candidate/applications') {
    return [
      {
        id: 1, jobId: 10,
        jobTitle: 'Senior Frontend Developer',
        companyName: 'Nexus Lab',
        companyLogo: '',
        location: 'Quận 1, TP.HCM',
        salary: '$3.000 – $5.000',
        jobType: 'Toàn thời gian',
        status: 'interview',
        appliedAt: '2024-05-10T09:00:00Z',
        updatedAt: '2024-05-18T14:00:00Z',
      },
      {
        id: 2, jobId: 11,
        jobTitle: 'React Developer',
        companyName: 'FinTech Solutions',
        companyLogo: '',
        location: 'Remote',
        salary: '$2.500 – $4.000',
        jobType: 'Remote',
        status: 'reviewing',
        appliedAt: '2024-05-12T11:00:00Z',
        updatedAt: '2024-05-14T08:00:00Z',
      },
      {
        id: 3, jobId: 12,
        jobTitle: 'UI Engineer',
        companyName: 'Grab Vietnam',
        companyLogo: '',
        location: 'Quận 7, TP.HCM',
        salary: '$2.000 – $3.500',
        jobType: 'Toàn thời gian',
        status: 'submitted',
        appliedAt: '2024-05-15T10:30:00Z',
        updatedAt: '2024-05-15T10:30:00Z',
      },
      {
        id: 4, jobId: 13,
        jobTitle: 'UX Researcher',
        companyName: 'Shopee',
        companyLogo: '',
        location: 'Quận 4, TP.HCM',
        salary: '$1.800 – $2.800',
        jobType: 'Toàn thời gian',
        status: 'rejected',
        appliedAt: '2024-04-20T09:00:00Z',
        updatedAt: '2024-04-28T16:00:00Z',
      },
    ];
  }

  // ── Candidate CVs ──────────────────────────────────────────────────────
  if (url === '/candidate/cv') {
    return [
      {
        id: 1,
        filename: 'NguyenVanAn_Senior_FE.pdf',
        name: 'NguyenVanAn_Senior_FE.pdf',
        size: 524288,
        url: '',
        status: 'indexed',
        uploadedAt: '2024-05-01T10:00:00Z',
      },
      {
        id: 2,
        filename: 'CV_AnNguyen_2024.docx',
        name: 'CV_AnNguyen_2024.docx',
        size: 204800,
        url: '',
        status: 'processing',
        uploadedAt: '2024-05-20T14:30:00Z',
      },
    ];
  }

  // ── Job list (public + candidate share same endpoint) ──────────────────
  if (url === '/jobs' || url.startsWith('/jobs?')) {
    return {
      total: 3,
      page: 1,
      limit: 10,
      items: [
        {
          id: 10,
          title: 'Senior Frontend Developer',
          companyName: 'Nexus Lab',
          companyLogo: '',
          location: 'Quận 1, TP.HCM',
          salary: '$3.000 – $5.000',
          jobType: 'Toàn thời gian',
          category: 'Lập trình',
          skills: ['React', 'TypeScript', 'GraphQL'],
          description: 'Xây dựng các sản phẩm frontend hiệu suất cao.',
          postedAt: '2024-05-01T00:00:00Z',
          deadline: '2024-06-30T00:00:00Z',
          status: 'active',
          isSaved: false,
        },
        {
          id: 11,
          title: 'React Developer',
          companyName: 'FinTech Solutions',
          companyLogo: '',
          location: 'Remote',
          salary: '$2.500 – $4.000',
          jobType: 'Remote',
          category: 'Lập trình',
          skills: ['React', 'Redux', 'Node.js'],
          description: 'Phát triển ứng dụng FinTech trên nền tảng React.',
          postedAt: '2024-05-05T00:00:00Z',
          deadline: '2024-06-15T00:00:00Z',
          status: 'active',
          isSaved: true,
        },
        {
          id: 12,
          title: 'UI Engineer',
          companyName: 'Grab Vietnam',
          companyLogo: '',
          location: 'Quận 7, TP.HCM',
          salary: '$2.000 – $3.500',
          jobType: 'Toàn thời gian',
          category: 'Thiết kế',
          skills: ['Figma', 'React', 'CSS'],
          description: 'Thiết kế và triển khai giao diện người dùng.',
          postedAt: '2024-05-08T00:00:00Z',
          deadline: '2024-06-20T00:00:00Z',
          status: 'active',
          isSaved: false,
        },
      ],
    };
  }

  // ── Job detail ─────────────────────────────────────────────────────────
  if (/^\/jobs\/\d+$/.test(url)) {
    return {
      id: 10,
      title: 'Senior Frontend Developer',
      companyName: 'Nexus Lab',
      companyLogo: '',
      companyWebsite: 'https://nexuslab.ai',
      companySize: '200 – 500 nhân viên',
      location: 'Tầng 24, Bitexco, Quận 1, TP.HCM',
      salary: '$3.000 – $5.000',
      jobType: 'Toàn thời gian',
      category: 'Lập trình',
      experience: '3 – 5 năm',
      education: 'Đại học trở lên',
      skills: ['React', 'TypeScript', 'GraphQL', 'Node.js'],
      description: '<p>Chào mừng bạn đến với Nexus Lab!</p><p>Chúng tôi đang tìm kiếm một Senior Frontend Developer tài năng để gia nhập đội ngũ kỹ thuật.</p>',
      requirements: ['3+ năm kinh nghiệm với React', 'Thành thạo TypeScript', 'Hiểu biết về GraphQL'],
      benefits: ['Lương cạnh tranh', 'Bảo hiểm cao cấp', 'Du lịch hàng năm', 'Thiết bị đời mới'],
      postedAt: '2024-05-01T00:00:00Z',
      deadline: '2024-06-30T00:00:00Z',
      status: 'active',
      isSaved: false,
      hasApplied: false,
    };
  }

  return [];
}

// Kiểm tra trạng thái tin tuyển dụng còn đang hoạt động.
function isActiveJobStatus(status = '') {
  const normalized = String(status).toLowerCase();
  return ['active', 'open', 'published', 'dang tuyen', 'dang hien thi'].includes(normalized);
}
