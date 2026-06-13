import { api } from "./api.js";
import { getRole, getUser } from "./auth.js";
import { hasRoute, navigate, setRoutes } from "./router.js";
import { initAdminHeader } from "./components/header/admin.js";
import { initHeader } from "./components/header/employer.js";
import { initAdminSidebar } from "./components/sidebar/admin.js";
import { initCandidateHeader } from "./components/header/candidate.js";

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

  candidate: {
    header: "./components/header/candidate.html",
    sidebar: "./components/sidebar/candidate.html",
    routes: {
      dashboard:        "./page/candidate/1_Dashboard.html",
      "job-list":       "./page/candidate/2_Job-List.html",
      "job-detail":     "./page/candidate/3_Job-Details.html",
      "job-saved":      "./page/candidate/4_Job-Saved.html",
      "job-applied":    "./page/candidate/5_Job-Applied.html",
      "cv-upload":      "./page/candidate/6_CV-Upload.html",
      "cv-management":  "./page/candidate/7_CV-Management.html",
      profile:          "./page/candidate/8_Profile.html",
      "profile-setting":"./page/candidate/9_Profile-Setting.html",
      "account-setting":"./page/candidate/10_Account-Setting.html",
    },
    pageScripts: {
      dashboard:        "./pages/candidate/1_dashboard.js",
      "job-list":       "./pages/candidate/2_job-list.js",
      "job-detail":     "./pages/candidate/3_job-detail.js",
      "job-saved":      "./pages/candidate/4_job-saved.js",
      "job-applied":    "./pages/candidate/5_job-applied.js",
      "cv-upload":      "./pages/candidate/6_cv-upload.js",
      "cv-management":  "./pages/candidate/7_cv-management.js",
      profile:          "./pages/candidate/8_profile.js",
      "profile-setting":"./pages/candidate/9_profile-setting.js",
      "account-setting":"./pages/candidate/10_account-setting.js",
    },
    afterLoad: initCandidateHeader,
  },
};

let appConfig = roleConfigs.employer;
let isPublicMode = false;

const publicConfig = {
  routes: {
    home: "./page/public/home.html",
    jobs: "./page/public/jobs.html",
    "job-detail": "./page/public/job-detail.html",
    login: "./page/public/login.html",
    register: "./page/public/register.html",
    "forgot-password": "./page/public/forgot-password.html",
  },
  pageScripts: {
    home: "./pages/public/home.js",
    jobs: "./pages/public/jobs.js",
    "job-detail": "./pages/public/job-detail.js",
    login: "./pages/public/login.js",
    register: "./pages/public/register.js",
    "forgot-password": "./pages/public/forgot-password.js",
  },
};

const logoutButtonIds = new Set([
  "headerLogoutButton",
  "candidateLogoutBtn",
  "adminLogoutButton"
]);

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !logoutButtonIds.has(button.id)) return;

  event.preventDefault();
  event.stopPropagation();
  logout();
});

async function loadComponent(id, path) {
  const separator = path.includes("?") ? "&" : "?";
  const res = await fetch(`${path}${separator}v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Load failed: ${path}`);

  const target = document.getElementById(id);
  if (!target) throw new Error(`Container not found: ${id}`);

  target.innerHTML = await res.text();
}

async function init() {
  if (!getUser()) {
    initPublicApp();
    return;
  }

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

function initPublicApp() {
  isPublicMode = true;
  appConfig = publicConfig;
  setRoutes(publicConfig.routes);

  document.getElementById("header").innerHTML = "";
  document.getElementById("sidebar").innerHTML = "";
  renderPublicHeader();
  renderPublicFooter();

  const contentShell = document.getElementById("contentShell");
  contentShell?.classList.remove("ml-64", "ml-20", "pt-16");
  contentShell?.classList.add("pt-16");

  setupRouter();
}

function renderPublicHeader() {
  const header = document.getElementById("header");
  if (!header) return;

  header.innerHTML = `
    <header class="fixed left-0 right-0 top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <nav class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <a class="flex items-center gap-2 text-lg font-black tracking-tight text-slate-950" href="#home" data-route="home">
          <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <span class="material-symbols-outlined text-xl">work</span>
          </span>
          Smart Job Portal
        </a>
        <div class="hidden items-center gap-6 text-sm font-bold text-slate-600 md:flex">
          <a class="public-nav-link hover:text-blue-600" href="#jobs" data-route="jobs">Việc làm</a>
          <a class="public-nav-link hover:text-blue-600" href="#home" data-route="home" data-scroll-target="companies">Công ty</a>
          <a class="public-nav-link hover:text-blue-600" href="#home" data-route="home" data-scroll-target="about">Giới thiệu</a>
          <a class="public-nav-link hover:text-blue-600" href="#home" data-route="home" data-scroll-target="contact">Liên hệ</a>
        </div>
        <div class="flex items-center gap-3">
          <a class="public-nav-link rounded-lg px-3 py-2 text-sm font-black text-slate-700 hover:bg-slate-100" href="#login" data-route="login">Đăng nhập</a>
          <a class="public-nav-link rounded-lg bg-blue-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-blue-700" href="#register" data-route="register">Đăng ký</a>
        </div>
      </nav>
    </header>
  `;
}

function renderPublicFooter() {
  const footer = document.getElementById("footer");
  if (!footer) return;

  footer.innerHTML = `
    <footer class="border-t border-slate-200 bg-white">
      <div class="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <p class="text-lg font-black text-slate-950">Smart Job Portal</p>
          <p class="mt-4 max-w-xs text-sm font-semibold leading-6 text-slate-500">Nền tảng tuyển dụng hỗ trợ CV PDF, tìm kiếm full-text và quản lý ứng tuyển.</p>
        </div>
        <div>
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">Nền tảng</p>
          <div class="mt-4 space-y-3 text-sm font-semibold text-slate-500">
            <a class="block hover:text-blue-600" href="#jobs" data-route="jobs">Tìm việc</a>
            <a class="block hover:text-blue-600" href="#home" data-route="home">Công ty</a>
            <a class="block hover:text-blue-600" href="#register" data-route="register">Phân tích CV</a>
          </div>
        </div>
        <div>
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">Hỗ trợ</p>
          <div class="mt-4 space-y-3 text-sm font-semibold text-slate-500">
            <a class="block hover:text-blue-600" href="#forgot-password" data-route="forgot-password">Quên mật khẩu</a>
            <a class="block hover:text-blue-600" href="#home" data-route="home">Hướng dẫn</a>
            <a class="block hover:text-blue-600" href="#home" data-route="home">Liên hệ</a>
          </div>
        </div>
        <div>
          <p class="text-xs font-black uppercase tracking-wider text-slate-400">Pháp lý</p>
          <div class="mt-4 space-y-3 text-sm font-semibold text-slate-500">
            <a class="block hover:text-blue-600" href="#home" data-route="home">Chính sách bảo mật</a>
            <a class="block hover:text-blue-600" href="#home" data-route="home">Điều khoản dịch vụ</a>
          </div>
        </div>
      </div>
      <div class="mx-auto max-w-7xl border-t border-slate-200 px-4 py-6 text-sm font-semibold text-slate-500 sm:px-6">
        © 2024 Smart Job Portal.
      </div>
    </footer>
  `;
}

function renderLoginScreen() {
  document.getElementById("header").innerHTML = "";
  document.getElementById("sidebar").innerHTML = "";
  document.getElementById("footer").innerHTML = "";

  const contentShell = document.getElementById("contentShell");
  contentShell?.classList.remove("ml-64", "ml-20", "pt-16");

  const app = document.getElementById("app");
  if (!app) return;

  const accounts = {
    employer: { label: "Nhà tuyển dụng", email: "hr@abc.tech", password: "123456" },
    candidate: { label: "Ứng viên", email: "tuyet.mai@student.uit.edu.vn", password: "123456" },
    admin: { label: "Quản trị", email: "admin@smartjob.vn", password: "123456" }
  };

  app.innerHTML = `
    <main class="min-h-screen bg-slate-50 px-4 py-10">
      <section class="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div class="grid w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl lg:grid-cols-[1fr_440px]">
          <div class="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600">
                <span class="material-symbols-outlined text-3xl">rocket_launch</span>
              </div>
              <h1 class="mt-8 text-4xl font-black tracking-tight">Smart Job Portal</h1>
              <p class="mt-4 max-w-md text-base font-semibold leading-7 text-slate-300">
                Cổng tuyển dụng cho nhà tuyển dụng, ứng viên và quản trị viên.
              </p>
            </div>
            <div class="grid grid-cols-3 gap-3 text-sm font-bold text-slate-300">
              <div class="rounded-lg bg-white/10 p-4">Jobs</div>
              <div class="rounded-lg bg-white/10 p-4">CV PDF</div>
              <div class="rounded-lg bg-white/10 p-4">Admin</div>
            </div>
          </div>

          <form id="loginForm" class="p-6 sm:p-10">
            <h2 class="text-3xl font-black text-slate-950">Đăng nhập</h2>
            <p class="mt-2 text-sm font-semibold text-slate-500">Chọn tài khoản demo hoặc nhập thông tin của bạn.</p>

            <div class="mt-6 grid grid-cols-3 gap-2">
              ${Object.entries(accounts).map(([role, account]) => `
                <button class="demoLogin rounded-lg border border-slate-200 px-3 py-3 text-xs font-black text-slate-700 transition hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700" type="button" data-role="${role}">
                  ${account.label}
                </button>
              `).join("")}
            </div>

            <label class="mt-6 block space-y-2">
              <span class="text-xs font-black uppercase tracking-wider text-slate-500">Email</span>
              <input id="loginEmail" class="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="email" required>
            </label>

            <label class="mt-4 block space-y-2">
              <span class="text-xs font-black uppercase tracking-wider text-slate-500">Mật khẩu</span>
              <input id="loginPassword" class="h-12 w-full rounded-lg border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" type="password" required>
            </label>

            <p id="loginMessage" class="mt-4 min-h-5 text-sm font-bold text-red-600"></p>

            <button id="loginSubmit" class="mt-2 flex h-12 w-full items-center justify-center rounded-lg bg-blue-600 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700" type="submit">
              Đăng nhập
            </button>
          </form>
        </div>
      </section>
    </main>
  `;

  const fillAccount = (role = "employer") => {
    document.getElementById("loginEmail").value = accounts[role].email;
    document.getElementById("loginPassword").value = accounts[role].password;
  };

  fillAccount("employer");
  app.querySelectorAll(".demoLogin").forEach((button) => {
    button.addEventListener("click", () => fillAccount(button.dataset.role));
  });

  document.getElementById("loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("loginMessage");
    const submit = document.getElementById("loginSubmit");
    message.textContent = "";
    submit.disabled = true;
    submit.textContent = "Đang đăng nhập...";

    try {
      const payload = await api.post("/auth/login", {
        email: document.getElementById("loginEmail").value.trim(),
        password: document.getElementById("loginPassword").value
      });

      const token = payload.accessToken || payload.token;
      if (token) {
        localStorage.setItem("accessToken", token);
        localStorage.setItem("token", token);
      }
      localStorage.setItem("user", JSON.stringify(payload.user || {}));
      window.location.hash = "#dashboard";
      window.location.reload();
    } catch (err) {
      message.textContent = err.message || "Không đăng nhập được.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Đăng nhập";
    }
  });
}

function logout() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  sessionStorage.clear();

  window.history.replaceState(null, "", window.location.pathname);
  window.location.reload();
}

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
    navigateTo(link.dataset.route, true).then(() => {
      const targetId = link.dataset.scrollTarget;
      if (!targetId) return;
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
  const fallback = isPublicMode ? "home" : "dashboard";
  return hasRoute(route) ? route : fallback;
}

async function navigateTo(route, updateHash = false) {
  const fallback = isPublicMode ? "home" : "dashboard";
  const nextRoute = hasRoute(route) ? route : fallback;

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
