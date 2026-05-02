const LOCAL_JOBS_KEY = 'smartJobLocalJobs';

// Doc tin cuc bo
export function getLocalJobs() {
  try {
    const jobs = JSON.parse(localStorage.getItem(LOCAL_JOBS_KEY) || '[]');
    return Array.isArray(jobs) ? jobs : [];
  } catch (err) {
    console.warn('Read local jobs error:', err);
    return [];
  }
}

// Luu tin cuc bo
export function saveLocalJob(job) {
  const jobs = getLocalJobs();
  const nextJob = {
    ...job,
    id: job.id || job._id || createLocalId(),
    updatedAt: new Date().toISOString()
  };

  const index = jobs.findIndex(item => String(item.id || item._id) === String(nextJob.id));
  if (index >= 0) {
    jobs[index] = { ...jobs[index], ...nextJob };
  } else {
    jobs.unshift(nextJob);
  }

  localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(jobs));
  return nextJob;
}

// Xoa tin cuc bo
export function deleteLocalJob(id) {
  const jobs = getLocalJobs().filter(job => String(job.id || job._id) !== String(id));
  localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(jobs));
}

// Tim tin cuc bo
export function findLocalJob(id) {
  return getLocalJobs().find(job => String(job.id || job._id) === String(id)) || null;
}

// Gop du lieu
export function mergeJobs(remoteJobs = []) {
  const jobsById = new Map();

  remoteJobs.forEach(job => {
    const id = job.id || job._id;
    if (id) jobsById.set(String(id), job);
  });

  getLocalJobs().forEach(job => {
    const id = job.id || job._id;
    if (id) jobsById.set(String(id), job);
  });

  return Array.from(jobsById.values());
}

// Tao id tam
export function createLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
