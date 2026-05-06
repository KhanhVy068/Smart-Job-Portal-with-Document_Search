import { getRole } from "./auth.js";
import { hasRoute, navigate, setRoutes } from "./router.js";
import { initAdminHeader } from "./components/header/admin.js";
import { initHeader } from "./components/header/employer.js";
import { initAdminSidebar } from "./components/sidebar/admin.js";

const roleConfigs = {
  admin: {
    header: "./components/header/admin.html",
    sidebar: "./components/sidebar/admin.html",
    routes: {
      dashboard: "./page/admin/1_Dashboard.html",
      users: "./page/admin/2_Users.html",
      jobs: "./page/admin/3_Jobs.html",
      "cv-documents": "./page/admin/4_CV.html",
      "search-analytics": "./page/admin/5_Search-Analytics.html",
      "background-jobs": "./page/admin/6_Background-Jobs.html",
      storage: "./page/admin/7_Storage.html",
      reports: "./page/admin/8_Reports.html",
      settings: "./page/admin/9_Settings.html",
    },
    pageScripts: {
      dashboard: "./pages/admin/1_Dashboard.js",
      users: "./pages/admin/2_Users.js",
      jobs: "./pages/admin/3_Jobs.js",
      "cv-documents": "./pages/admin/4_CV.js",
      "search-analytics": "./pages/admin/5_Search-Analytics.js",
      "background-jobs": "./pages/admin/6_Background-Jobs.js",
      storage: "./pages/admin/7_Storage.js",
      reports: "./pages/admin/8_Reports.js",
      settings: "./pages/admin/9_Settings.js",
    },
    afterLoad: () => {
      initAdminHeader();
      initAdminSidebar();
    },
  },
  employer: {
    header: "./components/header/employer.html",
    sidebar: "./components/sidebar/employer.html",
    routes: {
      dashboard: "./page/employer/1_dashboard.html",
      jobs: "./page/employer/2_jobs.html",
      "job-detail": "./page/employer/4_job-detail.html",
      candidates: "./page/employer/5_candidate-list.html",
      "cv-detail": "./page/employer/6_CV-detail.html",
      search: "./page/employer/7_search.html",
      saved: "./page/employer/8_saved.html",
      "post-job": "./page/employer/3_post-job.html",
      settings: "./page/employer/9_settings.html",
    },
    pageScripts: {
      dashboard: "./pages/employer/1_dashboard.js",
      jobs: "./pages/employer/2_jobs.js",
      candidates: "./pages/employer/5_candidate-list.js",
      "cv-detail": "./pages/employer/6_CV-detail.js",
      search: "./pages/employer/7_search.js",
      saved: "./pages/employer/8_saved.js",
      settings: "./pages/employer/9_settings.js",
      "job-detail": "./pages/employer/4_job-detaill.js",
      "post-job": "./pages/employer/3_postjob.js",
    },
    afterLoad: initHeader,
  },
};

let appConfig = roleConfigs.employer;

async function loadComponent(id, path) {
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${path}${separator}v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Load failed: ${path}`);

  const target = document.getElementById(id);
  if (!target) throw new Error(`Container not found: ${id}`);

  target.innerHTML = await res.text();
}

async function init() {
  appConfig = roleConfigs[getRole()] || roleConfigs.employer;
  setRoutes(appConfig.routes);

  await loadComponent("header", appConfig.header);
  await loadComponent("sidebar", appConfig.sidebar);
  await loadComponent("footer", "./components/footer.html");

  appConfig.afterLoad?.();
  setupSidebarToggle();
  setupRouter();
}

init();

function setupSidebarToggle() {
  const buttons = document.querySelectorAll("#toggleSidebar");
  const sidebar = document.getElementById("sidebarEl");
  if (!buttons.length || !sidebar) return;

  applySidebarState(false);

  buttons.forEach((btn) => btn.addEventListener("click", () => {
    applySidebarState(!sidebar.classList.contains("sidebar-collapsed"));
  }));
}

function applySidebarState(isCollapsed) {
  const buttons = document.querySelectorAll("#toggleSidebar");
  const sidebar = document.getElementById("sidebarEl");
  const header = document.getElementById("headerEl");
  const contentShell = document.getElementById("contentShell");
  const footer = document.getElementById("footerEl");

  sidebar?.classList.toggle("w-64", !isCollapsed);
  sidebar?.classList.toggle("w-20", isCollapsed);
  sidebar?.classList.toggle("sidebar-collapsed", isCollapsed);

  header?.classList.toggle("left-64", !isCollapsed);
  header?.classList.toggle("left-20", isCollapsed);

  contentShell?.classList.toggle("ml-64", !isCollapsed);
  contentShell?.classList.toggle("ml-20", isCollapsed);

  footer?.classList.toggle("ml-64", !isCollapsed);
  footer?.classList.toggle("ml-20", isCollapsed);

  buttons.forEach((btn) => btn.setAttribute("aria-expanded", String(!isCollapsed)));
}

function setupRouter() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest("[data-route]");
    if (!link) return;

    e.preventDefault();
    navigateTo(link.dataset.route, true);
  });

  window.addEventListener("hashchange", () => {
    navigateTo(getRouteFromHash());
  });
  window.addEventListener("popstate", () => {
    navigateTo(getRouteFromHash());
  });

  window.appRouter = { navigate: (route) => navigateTo(route, true) };
  navigateTo(getRouteFromHash());
}

function getRouteFromHash() {
  const route = window.location.hash.replace("#", "");
  return hasRoute(route) ? route : "dashboard";
}

async function navigateTo(route, updateHash = false) {
  const nextRoute = hasRoute(route) ? route : "dashboard";

  try {
    await navigate(nextRoute);
    await initPage(nextRoute);
    setActiveRoute(nextRoute);
    resetPageScroll();

    if (updateHash && window.location.hash !== `#${nextRoute}`) {
      window.history.pushState(null, "", `#${nextRoute}`);
    }
  } catch (err) {
    console.error("Navigation error:", err);
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `
        <section class="p-8">
          <div class="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            <h2 class="text-lg font-bold">Không tải được trang</h2>
            <p class="mt-2 text-sm">${err.message}</p>
          </div>
        </section>
      `;
    }
  }
}

async function initPage(route) {
  const script = appConfig.pageScripts[route];
  if (!script) return;

  try {
    const pageModule = await import(`${script}?v=${Date.now()}`);
    await pageModule.init?.();
  } catch (err) {
    console.error(`Page init error (${route}):`, err);
  }
}

function resetPageScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollLeft = 0;
  document.body.scrollLeft = 0;

  const contentShell = document.getElementById("contentShell");
  if (contentShell) contentShell.scrollLeft = 0;
}

function setActiveRoute(route) {
  document.querySelectorAll("[data-route]").forEach((link) => {
    const isActive = link.dataset.route === route;
    link.classList.toggle("active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}
