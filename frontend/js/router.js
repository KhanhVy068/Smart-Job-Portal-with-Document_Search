let routes = {
  dashboard: "./page/employer/1_dashboard.html",
  jobs: "./page/employer/2_jobs.html",
  "job-detail": "./page/employer/4_job-detail.html",
  candidates: "./page/employer/5_candidate-list.html",
  "cv-detail": "./page/employer/6_CV-detail.html",
  search: "./page/employer/7_search.html",
  saved: "./page/employer/8_saved.html",
  "post-job": "./page/employer/3_post-job.html",
  settings: "./page/employer/9_settings.html",
};

export function setRoutes(nextRoutes) {
  routes = { ...nextRoutes };
}

export function hasRoute(route) {
  return Object.prototype.hasOwnProperty.call(routes, route);
}

export async function navigate(route) {
  const path = routes[route];
  if (!path) throw new Error(`Unknown route: ${route}`);

  const app = document.getElementById("app");
  if (!app) throw new Error("App container not found");

  const res = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Load failed: ${path}`);

  const html = await res.text();
  app.innerHTML = html;
}
