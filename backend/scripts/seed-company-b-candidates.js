const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../src/config/db');
const searchService = require('../src/services/searchService');
const { cloudinary } = require('../src/config/cloudinary');

const EMPLOYER_EMAIL = 'BNguyenVan@gmail.com';
const CANDIDATE_COUNT = 50;
const APPLICATIONS_PER_JOB = 35;
const PASSWORD = '123456';

const uploadRoot = path.resolve(__dirname, '..', '..', 'uploads', 'demo-cvs');

const profiles = [
  ['Nguyen Minh Anh', 'Business Analyst', ['Business Analysis', 'SQL', 'Banking', 'Documentation']],
  ['Tran Gia Bao', 'System Development Engineer', ['Linux', 'Unix', 'System Design', 'C']],
  ['Le Hoang Phuc', 'Data Analyst', ['SQL', 'Python', 'Power BI', 'QlikView']],
  ['Pham Thanh Truc', 'Security Engineer', ['Security', 'Firewall', 'SIEM', 'Networking']],
  ['Vo Khanh Linh', 'Cloud Engineer', ['AWS', 'Azure', 'GCP', 'Cloud Architecture']],
  ['Dang Minh Quan', 'DevOps Engineer', ['Kubernetes', 'CI/CD', 'Docker', 'DNS Security']],
  ['Hoang Nhat Nam', 'Database Administrator', ['Oracle', 'PostgreSQL', 'Database', 'Linux']],
  ['Bui Ngoc Han', 'Product Analyst', ['Product', 'Analytics', 'Data Modeling', 'Stakeholder']],
  ['Do Quang Huy', 'AI Strategy Analyst', ['AI', 'Strategy Planning', 'Leadership', 'Team Management']],
  ['Mai Tue Nhi', 'Data Governance Specialist', ['Data Governance', 'Data Modeling', 'Azure', 'GCP']]
];

function candidateProfile(index) {
  const base = profiles[index % profiles.length];
  const sequence = String(index + 1).padStart(2, '0');
  return {
    fullName: `${base[0]} ${sequence}`,
    title: base[1],
    skills: base[2],
    email: `demo.candidate.${sequence}@smartjob.local`,
    phone: `090${String(1000000 + index).slice(-7)}`,
    location: index % 3 === 0 ? 'Ho Chi Minh' : index % 3 === 1 ? 'Ha Noi' : 'Da Nang',
    experience: 1 + (index % 8)
  };
}

function listCvFiles() {
  if (!fs.existsSync(uploadRoot)) {
    throw new Error(`CV folder not found: ${uploadRoot}`);
  }

  const files = fs.readdirSync(uploadRoot)
    .filter(name => /^cv\d+\.pdf$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map(name => path.join(uploadRoot, name));

  if (!files.length) {
    throw new Error(`No cv*.pdf files found in ${uploadRoot}`);
  }

  return files;
}

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function uploadCvToCloudinary(cvPath, candidateId, fileName) {
  const publicId = `demo-candidate-${candidateId}-${fileName
    .replace(/\.pdf$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cv'}`;

  const result = await cloudinary.uploader.upload(cvPath, {
    folder: 'smart-job-portal/cv',
    resource_type: 'raw',
    format: 'pdf',
    public_id: publicId,
    overwrite: true
  });

  return result.secure_url || result.url;
}

function cvText(profile, fileName) {
  return [
    profile.fullName,
    profile.title,
    `Location: ${profile.location}`,
    `Experience: ${profile.experience} years`,
    `Skills: ${profile.skills.join(', ')}`,
    `Demo CV file: ${fileName}`,
    'This profile is generated for Smart Job Portal demo data and job matching.'
  ].join('\n');
}

async function getEmployer() {
  const [[employer]] = await db.query(
    `SELECT u.id, u.full_name, ep.company_name
     FROM users u
     LEFT JOIN employer_profiles ep ON ep.user_id = u.id
     WHERE LOWER(u.email) = LOWER(?) AND u.deleted_at IS NULL
     LIMIT 1`,
    [EMPLOYER_EMAIL]
  );

  if (!employer) {
    throw new Error(`Employer not found for email ${EMPLOYER_EMAIL}`);
  }

  return employer;
}

async function getCompanyJobs(employerId) {
  const [jobs] = await db.query(
    `SELECT id, title
     FROM jobs
     WHERE employer_id = ? AND deleted_at IS NULL
     ORDER BY id`,
    [employerId]
  );

  if (!jobs.length) {
    throw new Error(`No jobs found for employer id ${employerId}`);
  }

  return jobs;
}

async function upsertCandidate(profile, passwordHash) {
  await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, phone, is_verified)
     VALUES (?, ?, ?, 'candidate', ?, TRUE)
     ON DUPLICATE KEY UPDATE
       full_name = VALUES(full_name),
       role = 'candidate',
       phone = VALUES(phone),
       is_verified = TRUE,
       deleted_at = NULL`,
    [profile.fullName, profile.email, passwordHash, profile.phone]
  );

  const [[user]] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [profile.email]);

  await db.query(
    `INSERT INTO candidate_profiles (user_id, title, desired_position, location, bio, skills, experience, education)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       desired_position = VALUES(desired_position),
       location = VALUES(location),
       bio = VALUES(bio),
       skills = VALUES(skills),
       experience = VALUES(experience),
       education = VALUES(education)`,
    [
      user.id,
      profile.title,
      profile.title,
      profile.location,
      `${profile.fullName} is a demo candidate for Smart Job Portal.`,
      JSON.stringify(profile.skills),
      profile.experience,
      'University graduate'
    ]
  );

  return user.id;
}

async function upsertDocument(candidateId, profile, cvPath) {
  const fileName = path.basename(cvPath);
  const hash = fileHash(cvPath);
  const publicUrl = await uploadCvToCloudinary(cvPath, candidateId, fileName);
  const extractedText = cvText(profile, fileName);
  const summary = `${profile.title} with ${profile.experience} years of experience. Skills: ${profile.skills.join(', ')}.`;

  const [[existing]] = await db.query(
    `SELECT id, file_url, storage_provider FROM documents
     WHERE user_id = ? AND file_name = ? AND doc_type = 'cv' AND deleted_at IS NULL
     LIMIT 1`,
    [candidateId, fileName]
  );

  if (existing) {
    await db.query(
      `UPDATE documents
       SET file_url = ?,
           storage_provider = 'cloudinary',
           file_hash = ?,
           extracted_text = ?,
           extracted_text_hash = ?,
           extracted_skills = ?,
           desired_position = ?,
           experience_years = ?,
           extracted_summary = ?,
           status = 'completed',
           extraction_status = 'completed',
           error_message = NULL,
           retry_count = 0,
           processed_at = NOW(),
           extracted_at = NOW(),
           deleted_at = NULL
       WHERE id = ?`,
      [
        publicUrl,
        hash,
        extractedText,
        crypto.createHash('sha256').update(extractedText).digest('hex'),
        JSON.stringify(profile.skills),
        profile.title,
        profile.experience,
        summary,
        existing.id
      ]
    );
    return existing.id;
  }

  const [result] = await db.query(
     `INSERT INTO documents (
       user_id, file_name, file_url, storage_provider, file_hash,
       extracted_text, extracted_text_hash, extracted_skills, desired_position,
       experience_years, extracted_summary, doc_type, status, extraction_status,
       retry_count, processed_at, extracted_at
     )
     VALUES (?, ?, ?, 'cloudinary', ?, ?, ?, ?, ?, ?, ?, 'cv', 'completed', 'completed', 0, NOW(), NOW())`,
    [
      candidateId,
      fileName,
      publicUrl,
      hash,
      extractedText,
      crypto.createHash('sha256').update(extractedText).digest('hex'),
      JSON.stringify(profile.skills),
      profile.title,
      profile.experience,
      summary
    ]
  );

  return result.insertId;
}

async function upsertApplication(jobId, candidateId, documentId, index) {
  const statuses = ['pending', 'reviewed', 'shortlisted', 'interviewed'];
  const status = statuses[index % statuses.length];
  const daysAgo = index % 8;
  await db.query(
    `INSERT INTO applications (job_id, candidate_id, cv_document_id, cover_letter, status, applied_at, created_at)
     VALUES (?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? DAY), DATE_SUB(NOW(), INTERVAL ? DAY))
     ON DUPLICATE KEY UPDATE
       cv_document_id = VALUES(cv_document_id),
       cover_letter = VALUES(cover_letter),
       status = VALUES(status),
       deleted_at = NULL,
       updated_at = NOW()`,
    [
      jobId,
      candidateId,
      documentId,
      'Tôi quan tâm đến vị trí này và mong muốn được trao đổi thêm trong buổi phỏng vấn.',
      status,
      daysAgo,
      daysAgo
    ]
  );
}

async function main() {
  const cvFiles = listCvFiles();
  const passwordHash = bcrypt.hashSync(PASSWORD, 10);
  const employer = await getEmployer();
  const jobs = await getCompanyJobs(employer.id);

  const candidates = [];
  for (let index = 0; index < CANDIDATE_COUNT; index += 1) {
    const profile = candidateProfile(index);
    const candidateId = await upsertCandidate(profile, passwordHash);
    const cvPath = cvFiles[index % cvFiles.length];
    const documentId = await upsertDocument(candidateId, profile, cvPath);
    candidates.push({ candidateId, documentId, profile });
  }

  for (let jobIndex = 0; jobIndex < jobs.length; jobIndex += 1) {
    const job = jobs[jobIndex];
    for (let offset = 0; offset < APPLICATIONS_PER_JOB; offset += 1) {
      const candidate = candidates[(jobIndex * 7 + offset) % candidates.length];
      await upsertApplication(job.id, candidate.candidateId, candidate.documentId, offset);
    }
  }

  const documentIds = candidates.map(item => item.documentId);
  for (const documentId of documentIds) {
    try {
      await searchService.indexDocument(documentId);
    } catch (error) {
      console.warn(`Index document ${documentId} warning: ${error.message}`);
    }
  }

  try {
    await searchService.reindexAll();
  } catch (error) {
    console.warn(`Reindex warning: ${error.message}`);
  }

  console.log(`Employer: ${employer.full_name} (${employer.company_name || EMPLOYER_EMAIL})`);
  console.log(`Candidates created/updated: ${candidates.length}`);
  console.log(`Jobs targeted: ${jobs.length}`);
  console.log(`Applications per job: ${APPLICATIONS_PER_JOB}`);
  console.log(`Demo candidate password: ${PASSWORD}`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
