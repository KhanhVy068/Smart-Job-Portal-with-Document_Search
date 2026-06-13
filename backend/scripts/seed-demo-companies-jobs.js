const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../src/config/db');
const searchService = require('../src/services/searchService');

const COMPANY_COUNT = 30;
const JOBS_PER_COMPANY = 20;
const PASSWORD = '123456';

const locations = [
  {
    city: 'Ho Chi Minh',
    addresses: [
      'Tangent Tower, 33 Le Duan, District 1, Ho Chi Minh',
      'Saigon Centre, 65 Le Loi, District 1, Ho Chi Minh',
      'Etown 5, Cong Hoa, Tan Binh, Ho Chi Minh',
      'The Hallmark, Thu Thiem, Ho Chi Minh',
      'QTSC Building, District 12, Ho Chi Minh'
    ]
  },
  {
    city: 'Ha Noi',
    addresses: [
      'Capital Place, 29 Lieu Giai, Ba Dinh, Ha Noi',
      'Keangnam Landmark 72, Nam Tu Liem, Ha Noi',
      'Dolphin Plaza, 28 Tran Binh, Ha Noi',
      'Leadvisors Tower, 643 Pham Van Dong, Ha Noi',
      'TNR Tower, 54A Nguyen Chi Thanh, Ha Noi'
    ]
  },
  {
    city: 'Da Nang',
    addresses: [
      'Software Park, 02 Quang Trung, Hai Chau, Da Nang',
      'FPT Complex, Nam Ky Khoi Nghia, Ngu Hanh Son, Da Nang',
      'Indochina Riverside Tower, Bach Dang, Da Nang',
      'Wink Tower, Tran Hung Dao, Son Tra, Da Nang',
      'Danang IT Park, Hoa Vang, Da Nang'
    ]
  }
];

const companies = [
  ['Aster Digital Labs', 'Software Product', 'aster-labs'],
  ['BluePeak Fintech', 'Fintech', 'bluepeak'],
  ['Citrus DataWorks', 'Data Platform', 'citrus-data'],
  ['Delta Cloud Studio', 'Cloud Services', 'delta-cloud'],
  ['Eon Retail Tech', 'E-commerce', 'eon-retail'],
  ['Futura HealthTech', 'Healthcare Technology', 'futura-health'],
  ['GalaxyPay Solutions', 'Payment', 'galaxypay'],
  ['Helio AI Research', 'Artificial Intelligence', 'helio-ai'],
  ['Ionix Cyber Defense', 'Cybersecurity', 'ionix-cyber'],
  ['Jade Logistics Tech', 'Logistics', 'jade-logistics'],
  ['Kite Software House', 'Outsourcing', 'kite-software'],
  ['Lumen EduTech', 'Education Technology', 'lumen-edutech'],
  ['Metro CRM Systems', 'CRM SaaS', 'metro-crm'],
  ['Nova Banking Platform', 'Banking Technology', 'nova-banking'],
  ['Orbit Travel Cloud', 'Travel Technology', 'orbit-travel'],
  ['Pixel Commerce Group', 'Marketplace', 'pixel-commerce'],
  ['Quantum BI Hub', 'Business Intelligence', 'quantum-bi'],
  ['RiverTech Mobile', 'Mobile Application', 'river-mobile'],
  ['Summit ERP Vietnam', 'ERP', 'summit-erp'],
  ['Terra IoT Solutions', 'IoT', 'terra-iot'],
  ['Umbra Security Lab', 'Security Product', 'umbra-security',
  ],
  ['Vector DevOps Center', 'DevOps Platform', 'vector-devops'],
  ['WaveGame Studio', 'Game Technology', 'wavegame'],
  ['Xeno CloudOps', 'Managed Cloud', 'xeno-cloudops'],
  ['Yotta Data Lake', 'Big Data', 'yotta-data'],
  ['Zenith HRTech', 'Recruitment SaaS', 'zenith-hr'],
  ['Aurora Product Hub', 'Product Studio', 'aurora-product'],
  ['Beacon Analytics', 'Analytics Consulting', 'beacon-analytics'],
  ['Comet AI Factory', 'AI Product', 'comet-ai'],
  ['Dynamo Platform Co', 'Platform Engineering', 'dynamo-platform']
];

const roles = [
  ['Backend Engineer', 'Node.js, Express, MySQL, Redis', 'Xay dung API va service xu ly nghiep vu cot loi'],
  ['Frontend Engineer', 'React, JavaScript, HTML, CSS', 'Phat trien giao dien web toi uu trai nghiem nguoi dung'],
  ['Fullstack Developer', 'Node.js, React, MySQL, REST API', 'Lam viec tren ca frontend va backend cua san pham'],
  ['Business Analyst', 'Business Analysis, BPMN, SQL, Documentation', 'Phan tich yeu cau va viet tai lieu nghiep vu'],
  ['Data Analyst', 'SQL, Python, Power BI, Dashboard', 'Phan tich du lieu va xay dung bao cao van hanh'],
  ['Data Engineer', 'ETL, Airflow, Spark, Data Warehouse', 'Xay dung pipeline du lieu cho he thong lon'],
  ['DevOps Engineer', 'Docker, Kubernetes, CI/CD, Linux', 'Tu dong hoa build, deploy va giam sat he thong'],
  ['Cloud Solution Architect', 'AWS, Azure, GCP, System Architecture', 'Thiet ke kien truc cloud cho san pham doanh nghiep'],
  ['Security Engineer', 'Firewall, SIEM, Network Security, OWASP', 'Bao ve ha tang va ung dung truoc cac rui ro bao mat'],
  ['QA Automation Engineer', 'Selenium, Playwright, API Testing, CI', 'Xay dung test automation cho web va API'],
  ['Mobile Developer', 'Flutter, Android, iOS, REST API', 'Phat trien ung dung mobile da nen tang'],
  ['Product Owner', 'Product Strategy, Roadmap, Agile, User Story', 'Dinh huong backlog va uu tien tinh nang san pham'],
  ['UI/UX Designer', 'Figma, Design System, User Research', 'Thiet ke giao dien va luong trai nghiem nguoi dung'],
  ['Database Administrator', 'Oracle, PostgreSQL, MySQL, Backup', 'Quan tri database va toi uu hieu nang truy van'],
  ['Machine Learning Engineer', 'Python, ML, NLP, MLOps', 'Xay dung mo hinh may hoc va quy trinh trien khai'],
  ['Project Manager', 'Scrum, Planning, Risk Management, Delivery', 'Quan ly tien do va dieu phoi doi ngu du an'],
  ['Technical Lead', 'System Design, Code Review, Mentoring', 'Dan dat ky thuat va dam bao chat luong kien truc'],
  ['Technical Support Engineer', 'Linux, SQL, Troubleshooting, Customer Support', 'Ho tro khach hang xu ly su co ky thuat'],
  ['Integration Engineer', 'REST API, Webhook, OAuth, Message Queue', 'Tich hop he thong voi doi tac va nen tang ben ngoai'],
  ['Data Governance Specialist', 'Data Modeling, Data Quality, Governance', 'Xay dung quy chuan va kiem soat chat luong du lieu']
];

const levels = ['Junior', 'Middle', 'Senior', 'Lead'];
const jobTypes = ['Full-time', 'Remote', 'Full-time', 'Freelance'];

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function salaryMin(companyIndex, jobIndex) {
  return 12000000 + ((companyIndex + jobIndex) % 8) * 3000000;
}

function makeDescription(company, role, level, location, jobIndex) {
  return [
    `${company[0]} dang tuyen ${level} ${role[0]} cho van phong ${location.city}.`,
    `Vi tri nay tham gia phat trien san pham trong linh vuc ${company[1]} voi muc tieu cai thien hieu nang, do on dinh va trai nghiem nguoi dung.`,
    `Ung vien se phoi hop voi Product, QA va cac nhom ky thuat de ${role[2].toLowerCase()}.`,
    `Day la JD demo so ${jobIndex + 1} cua ${company[0]}, duoc tao de kiem thu tim kiem, loc dia diem va ung tuyen trong he thong Smart Job Portal.`
  ].join('\n\n');
}

function makeRequirements(role, level) {
  return [
    `Co kinh nghiem voi ${role[1]}.`,
    `${level === 'Junior' ? 'Nam chac kien thuc nen tang va san sang hoc cong nghe moi.' : 'Co kha nang thiet ke giai phap, review va toi uu he thong.'}`,
    'Giao tiep tot, tu duy phan tich ro rang va co tinh than lam viec nhom.',
    'Uu tien ung vien tung tham gia du an thuc te hoac co san pham demo.'
  ].join('\n');
}

function makeBenefits(companyIndex) {
  const months = 13 + (companyIndex % 2);
  return [
    `Luong thang ${months}, review luong dinh ky.`,
    'Bao hiem, ngay nghi phep va che do dao tao noi bo.',
    'Moi truong lam viec linh hoat, co co hoi tiep can san pham that.',
    'Ho tro thiet bi lam viec va ngan sach hoc tap.'
  ].join('\n');
}

async function ensureCategory(name, parentId = null) {
  const categorySlug = slug(name);
  await db.query(
    `INSERT INTO job_categories (name, slug, parent_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), parent_id = VALUES(parent_id), deleted_at = NULL`,
    [name, categorySlug, parentId]
  );
  const [[category]] = await db.query('SELECT id FROM job_categories WHERE slug = ? LIMIT 1', [categorySlug]);
  return category.id;
}

async function ensureEmployer(company, index, passwordHash) {
  const location = locations[index % locations.length];
  const address = location.addresses[index % location.addresses.length];
  const email = `demo.hr.${String(index + 1).padStart(2, '0')}@smartjob.local`;

  await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, phone, avatar_url, is_verified)
     VALUES (?, ?, ?, 'employer', ?, NULL, TRUE)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       role = 'employer',
       phone = VALUES(phone),
       is_verified = TRUE,
       deleted_at = NULL`,
    [company[0], email, passwordHash, `028${String(39000000 + index).slice(-8)}`]
  );

  const [[user]] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);

  await db.query(
    `INSERT INTO employer_profiles (user_id, company_name, website, logo_url, industry, company_size, address, description, company_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       company_name = VALUES(company_name),
       website = VALUES(website),
       logo_url = VALUES(logo_url),
       industry = VALUES(industry),
       company_size = VALUES(company_size),
       address = VALUES(address),
       description = VALUES(description),
       company_email = VALUES(company_email)`,
    [
      user.id,
      company[0],
      `https://${company[2]}.example.com`,
      '',
      company[1],
      ['51-200', '201-500', '500+'][index % 3],
      address,
      `${company[0]} la cong ty demo trong linh vuc ${company[1]}, co van phong tai ${location.city}.`,
      email
    ]
  );

  return { employerId: user.id, location, address, email };
}

async function upsertJob(employerId, categoryId, company, companyIndex, jobIndex, location) {
  const role = roles[(companyIndex * JOBS_PER_COMPANY + jobIndex) % roles.length];
  const level = levels[(companyIndex + jobIndex) % levels.length];
  const title = `${level} ${role[0]} (${company[0].split(' ')[0]}-${String(jobIndex + 1).padStart(2, '0')})`;
  const min = salaryMin(companyIndex, jobIndex);
  const max = min + 10000000 + (jobIndex % 5) * 2000000;
  const jobType = jobTypes[(companyIndex + jobIndex) % jobTypes.length];
  const office = location.addresses[jobIndex % location.addresses.length];

  const [[existing]] = await db.query(
    'SELECT id FROM jobs WHERE employer_id = ? AND title = ? AND deleted_at IS NULL LIMIT 1',
    [employerId, title]
  );

  const values = [
    employerId,
    categoryId,
    title,
    makeDescription(company, role, level, location, jobIndex),
    office,
    min,
    max,
    'VND',
    jobType,
    'open',
    45 + (jobIndex % 30),
    1 + ((companyIndex + jobIndex) % 7),
    1 + (jobIndex % 4),
    makeBenefits(companyIndex),
    makeRequirements(role, level),
    JSON.stringify(role[1].split(',').map(item => item.trim()))
  ];

  if (existing) {
    await db.query(
      `UPDATE jobs
       SET category_id = ?, description = ?, location = ?, salary_min = ?, salary_max = ?,
           currency = ?, job_type = ?, status = ?, expiry_date = DATE_ADD(CURRENT_DATE, INTERVAL ? DAY),
           experience_required = ?, positions_available = ?, benefits = ?, requirements = ?, skills = ?
       WHERE id = ?`,
      [
        categoryId,
        values[3],
        values[4],
        values[5],
        values[6],
        values[7],
        values[8],
        values[9],
        values[10],
        values[11],
        values[12],
        values[13],
        values[14],
        values[15],
        existing.id
      ]
    );
    return existing.id;
  }

  const [result] = await db.query(
    `INSERT INTO jobs (
       employer_id, category_id, title, description, location,
       salary_min, salary_max, currency, job_type, status,
       expiry_date, experience_required, positions_available, benefits, requirements, skills
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_DATE, INTERVAL ? DAY), ?, ?, ?, ?, ?)`,
    values
  );

  return result.insertId;
}

async function main() {
  const passwordHash = bcrypt.hashSync(PASSWORD, 10);
  const parentId = await ensureCategory('Demo Technology');
  const categoryIds = {
    software: await ensureCategory('Demo Software Engineering', parentId),
    data: await ensureCategory('Demo Data and AI', parentId),
    security: await ensureCategory('Demo Security and Cloud', parentId),
    product: await ensureCategory('Demo Product and Business', parentId)
  };
  const categoryCycle = [categoryIds.software, categoryIds.data, categoryIds.security, categoryIds.product];

  const indexedJobIds = [];

  for (let companyIndex = 0; companyIndex < COMPANY_COUNT; companyIndex += 1) {
    const company = companies[companyIndex];
    const employer = await ensureEmployer(company, companyIndex, passwordHash);

    for (let jobIndex = 0; jobIndex < JOBS_PER_COMPANY; jobIndex += 1) {
      const categoryId = categoryCycle[(companyIndex + jobIndex) % categoryCycle.length];
      const jobId = await upsertJob(employer.employerId, categoryId, company, companyIndex, jobIndex, employer.location);
      indexedJobIds.push(jobId);
    }
  }

  for (const jobId of indexedJobIds) {
    try {
      await searchService.indexJob(jobId);
    } catch (error) {
      console.warn(`Index job ${jobId} warning: ${error.message}`);
    }
  }

  try {
    await searchService.reindexAll();
  } catch (error) {
    console.warn(`Reindex warning: ${error.message}`);
  }

  console.log(`Companies created/updated: ${COMPANY_COUNT}`);
  console.log(`Jobs created/updated: ${COMPANY_COUNT * JOBS_PER_COMPANY}`);
  console.log('Locations: Ho Chi Minh, Ha Noi, Da Nang');
  console.log(`Demo employer password: ${PASSWORD}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
