export function getUser() {
  return JSON.parse(localStorage.getItem('user'));
}

export function getRole() {
  return getUser()?.role || 'employer';
}