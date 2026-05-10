export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export function getRole() {
  return String(getUser()?.role || 'employer').toLowerCase();
}
