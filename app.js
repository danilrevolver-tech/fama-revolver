// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
const SUPABASE_URL = window.SUPABASE_URL || "https://oxagdnvqnzaoraplgihb.supabase.co";
const SUPABASE_KEY = window.SUPABASE_KEY || "sb_publishable_eEQ4ctw-pQiYAnWRaq0uOQ_ZTa2mjc1";

if (!window.SUPABASE_URL || !window.SUPABASE_KEY) {
  console.warn('Supabase config loaded from hard-coded values. To use your own values, set window.SUPABASE_URL and window.SUPABASE_KEY before app.js or replace the constants in app.js.');
}

// Create Supabase client
if (typeof window !== 'undefined') {
  if (!window.supabaseClient) {
    if (window.supabase && window.supabase.createClient) {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } else {
      console.error('Supabase library not loaded. Make sure the CDN script is loaded before app.js');
      window.supabaseClient = null;
    }
  }

  if (window.supabaseClient && window.supabase !== window.supabaseClient) {
    window.supabase = window.supabaseClient;
  }
}

// Define supabase once using var (function-scoped, not const)
if (typeof supabase === 'undefined') {
  var supabase = window.supabaseClient || window.supabase || null;
}

// Safe helper to get Supabase client with check
function getClient() {
  const client = window.supabaseClient || window.supabase;
  if (!client) {
    throw new Error('Supabase client not initialized');
  }
  return client;
}

// Setup auth state listener
function setupAuthStateListener() {
  const client = window.supabaseClient;
  if (!client || !client.auth) {
    console.error('Supabase not initialized');
    return;
  }
  client.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      currentUser = session.user;
      currentSession = session;
    } else {
      currentUser = null;
      currentSession = null;
    }
  });
}

// --- localStorage helpers (for backward compatibility) ---
const STORAGE_KEYS = {
  USERS: "revolver_users",
  SESSION: "revolver_session",
  COMPLAINTS: "revolver_complaints",
  FORUM: "revolver_forum_posts",
  UNION_FORUM: "revolver_union_forum_posts",
  UNION_COMMENTS: "revolver_union_comments",
  MARKET: "revolver_market",
  PROFILE_MESSAGES: "revolver_profile_msgs",
  NEWS: "revolver_news",
  TREASURY: "revolver_treasury",
  EVENTS: "revolver_events",
};

const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  UNION_LEADER: "union_leader",
  UNION_DEPUTY: "union_deputy",
  USER: "user",
};

const OWNER_EMAIL = "shesdna13@gmail.com";

// --- Global Auth State ---
let currentUser = null;
let currentSession = null;

// --- auth via Supabase ---

function getSession() {
  if (!currentUser || !currentSession) return null;
  return {
    id: currentUser.id,
    email: currentUser.email,
    login: currentUser.user_metadata?.login || currentUser.email,
    role: currentUser.role || currentUser.user_metadata?.role || ROLES.USER
  };
}

async function initAuth() {
  // Wait for Supabase to be initialized
  let attempts = 0;
  while (!window.supabaseClient && attempts < 50) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (!window.supabaseClient || !window.supabaseClient.auth) {
    console.error('Supabase client not initialized');
    return;
  }
  
  const { data: { session }, error } = await window.supabaseClient.auth.getSession();
  if (!error && session && session.user) {
    currentUser = session.user;
    currentSession = session;
  }
}

// This will be called during page initialization
setupAuthStateListener();

async function registerUser(login, email, password) {
  if (login.length < 3) {
    return { ok: false, error: "Логин слишком короткий (мин. 3 символа)." };
  }
  if (!/^[a-zA-Z]+_[a-zA-Z]+$/.test(login)) {
    return { ok: false, error: "Логин (никнейм) должен быть в формате Имя_Фамилия (например: Ivan_Petrov)." };
  }
  if (password.length < 6) {
    return { ok: false, error: "Пароль слишком короткий (мин. 6 символов)." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, error: "Введите корректный Email." };
  }

  const client = getClient();

  // Проверить, существует ли логин
  const { count: loginCount } = await client
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("login", login);
  
  if (loginCount > 0) {
    return { ok: false, error: "Логин уже занят." };
  }

  // Проверить, существует ли email
  const { count: emailCount } = await client
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase());
  
  if (emailCount > 0) {
    return { ok: false, error: "Этот Email уже используется." };
  }

  // Создать пользователя через Supabase Auth
  const { data: authData, error: authError } = await client.auth.signUp({
    email,
    password,
    options: {
      data: {
        login,
        role: ROLES.USER
      }
    }
  });

  if (authError) {
    return { ok: false, error: authError.message };
  }

  if (!authData.user) {
    return { ok: false, error: "Ошибка регистрации" };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const isOwner = normalizedEmail === OWNER_EMAIL.toLowerCase();

  if (!authData.session || !authData.session.user) {
    console.warn("SignUp completed without active session; profile creation will happen after подтверждение Email.", authData);
    return { ok: true, pendingVerification: true };
  }

  // Создать профиль сразу, если пользователь уже авторизован
  const { error: profileError } = await client
    .from("profiles")
    .insert({
      id: authData.user.id,
      login,
      email: normalizedEmail,
      role: isOwner ? ROLES.OWNER : ROLES.USER
    });

  if (profileError) {
    console.error("Profile insert error:", profileError);
    return { ok: false, error: profileError.message || "Ошибка создания профиля" };
  }

  return { ok: true };
}

async function ensureProfileForUser(user) {
  if (!user || !user.id) return;
  const client = getClient();

  const { data: existingProfile, error: fetchError } = await client
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (fetchError) {
    console.error("Error checking existing profile:", fetchError);
    return;
  }

  if (existingProfile) {
    return;
  }

  const login = user.user_metadata?.login || user.email?.split('@')[0] || user.id;
  const role = user.user_metadata?.role || ROLES.USER;
  const email = user.email?.toLowerCase().trim() || "";

  const { error: insertError } = await client
    .from("profiles")
    .insert({
      id: user.id,
      login,
      email,
      role
    });

  if (insertError) {
    console.error("Failed to create missing profile after login:", insertError);
  }
}

async function loginUser(email, password) {
  const client = getClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (data?.user) {
    await ensureProfileForUser(data.user);
    // Обновляем роль из profiles
    const profile = await findProfileByLoginOrEmail(data.user.email);
    if (profile) {
      data.user.role = profile.role;
    }
    currentUser = data.user;
    currentSession = data.session;
  }

  return { ok: true };
}

async function logout() {
  const client = getClient();
  const { error } = await client.auth.signOut();
  if (error) console.error("Logout error:", error);
  currentUser = null;
  currentSession = null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hasRole(...roles) {
  const session = getSession();
  return !!session && roles.includes(session.role);
}

function ensureOwnerExists() {
  // Supabase handles user management - this is legacy
}

function ensureSingleOwner() {
  // Supabase handles role management - this is legacy
}

// --- UI helpers ---

const mainContent = document.getElementById("main-content");
const authBar = document.getElementById("auth-bar");
const sidebarMenu = document.getElementById("side-menu");
const sidebarToggle = document.getElementById("sidebar-toggle");
const toastEl = document.getElementById("toast");

let activeView = "home";
let activeUnionId = "alpha";
let activeUnionForumTopic = "complaints";
let activeMessageUser = null;
let currentProfileUser = null;

window.openProfile = function(login) {
  currentProfileUser = login;
  setActiveMenuItem("profile");
  renderView("profile");
};

function safeEscapeHtml(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderUserLink(login) {
  const safeStr = safeEscapeHtml(login);
  return `<span onclick="window.openProfile('${safeStr}')" style="cursor:pointer; color:#bfdbfe; font-weight:600; text-decoration:none; transition: color 0.15s;" onmouseover="this.style.textDecoration='underline'; this.style.color='#93c5fd'" onmouseout="this.style.textDecoration='none'; this.style.color='#bfdbfe'">${safeStr}</span>`;
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("toast--visible");
  setTimeout(() => {
    toastEl.classList.remove("toast--visible");
  }, 2500);
}

function renderAuthBar() {
  const session = getSession();
  const adminMenuItem = document.getElementById("admin-menu-item");
  if (adminMenuItem) {
    adminMenuItem.style.display = hasRole(ROLES.OWNER, ROLES.ADMIN) ? "" : "none";
  }
  if (!session) {
    authBar.innerHTML = `
      <button class="btn btn--ghost" id="open-login">Вход</button>
      <button class="btn btn--primary" id="open-register">Регистрация</button>
    `;
  } else {
    const roleClass =
      session.role === ROLES.OWNER
        ? "role-badge role-badge--owner"
        : session.role === ROLES.ADMIN
        ? "role-badge role-badge--admin"
        : "role-badge";
    let roleLabel = "user";
    if (session.role === ROLES.OWNER) roleLabel = "owner";
    else if (session.role === ROLES.ADMIN) roleLabel = "admin";
    else if (session.role === ROLES.UNION_LEADER) roleLabel = "глава союзов";
    else if (session.role === ROLES.UNION_DEPUTY) roleLabel = "заместитель союзов";
    authBar.innerHTML = `
      <div class="auth-user">
        <div class="auth-user__name">Привет, <span>${session.login}</span></div>
        <div class="${roleClass}">${roleLabel}</div>
        <button class="btn btn--ghost" id="logout-btn">Выйти</button>
      </div>
    `;
  }

  const openLogin = document.getElementById("open-login");
  const openRegister = document.getElementById("open-register");
  const logoutBtn = document.getElementById("logout-btn");

  if (openLogin) {
    openLogin.addEventListener("click", () => openModal("login-modal"));
  }
  if (openRegister) {
    openRegister.addEventListener("click", () => openModal("register-modal"));
  }
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logout();
      renderAuthBar();
      renderView(activeView);
      showToast("Вы вышли из аккаунта.");
    });
  }
}

function normalizeUsersAndSession() {
  // Supabase Auth handles session and user validation automatically
  // This is kept for backward compatibility but is no longer needed
}

function normalizeRole(value) {
  if (typeof value !== 'string') return ROLES.USER;
  const normalizedValue = String(value).toLowerCase().trim();
  const validRoles = [ROLES.OWNER, ROLES.ADMIN, ROLES.UNION_LEADER, ROLES.UNION_DEPUTY, ROLES.USER];
  if (validRoles.includes(normalizedValue)) {
    return normalizedValue;
  }
  return ROLES.USER;
}

function ensureOwnerExistsAndUnique() {
  // This function is now handled by Supabase backend
  // User roles and ownership are managed in the 'profiles' table
}

function normalizeLoginAndEmail(users) {
  // Supabase handles data validation at the database level
  // This legacy function is no longer needed
}

function getOrCreateLocalSession(users) {
  // Session management moved to Supabase Auth
  // Check currentSession and currentUser instead
  return currentSession || null;
}

// Initialize auth on page load
async function initPage() {
  await initAuth();
  renderAuthBar();
  renderView(activeView);
}

window.openProfile = function(login) {
  currentProfileUser = login;
  setActiveMenuItem("profile");
  renderView("profile");
};

function safeEscapeHtml(str) {
  if (typeof escapeHtml === 'function') return escapeHtml(str);
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderUserLink(login) {
  const safeStr = safeEscapeHtml(login);
  return `<span onclick="window.openProfile('${safeStr}')" style="cursor:pointer; color:#bfdbfe; font-weight:600; text-decoration:none; transition: color 0.15s;" onmouseover="this.style.textDecoration='underline'; this.style.color='#93c5fd'" onmouseout="this.style.textDecoration='none'; this.style.color='#bfdbfe'">${safeStr}</span>`;
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("toast--visible");
  setTimeout(() => {
    toastEl.classList.remove("toast--visible");
  }, 2500);
}

function renderAuthBar() {
  const session = getSession();
  const adminMenuItem = document.getElementById("admin-menu-item");
  if (adminMenuItem) {
    adminMenuItem.style.display = hasRole(ROLES.OWNER, ROLES.ADMIN) ? "" : "none";
  }
  if (!session) {
    authBar.innerHTML = `
      <button class="btn btn--ghost" id="open-login">Вход</button>
      <button class="btn btn--primary" id="open-register">Регистрация</button>
    `;
  } else {
    const roleClass =
      session.role === ROLES.OWNER
        ? "role-badge role-badge--owner"
        : session.role === ROLES.ADMIN
        ? "role-badge role-badge--admin"
        : "role-badge";
    let roleLabel = "user";
    if (session.role === ROLES.OWNER) roleLabel = "owner";
    else if (session.role === ROLES.ADMIN) roleLabel = "admin";
    else if (session.role === ROLES.UNION_LEADER) roleLabel = "глава союзов";
    else if (session.role === ROLES.UNION_DEPUTY) roleLabel = "заместитель союзов";
    authBar.innerHTML = `
      <div class="auth-user">
        <div class="auth-user__name">Привет, <span>${session.login}</span></div>
        <div class="${roleClass}">${roleLabel}</div>
        <button class="btn btn--ghost" id="logout-btn">Выйти</button>
      </div>
    `;
  }

  const openLogin = document.getElementById("open-login");
  const openRegister = document.getElementById("open-register");
  const logoutBtn = document.getElementById("logout-btn");

  if (openLogin) {
    openLogin.addEventListener("click", () => openModal("login-modal"));
  }
  if (openRegister) {
    openRegister.addEventListener("click", () => openModal("register-modal"));
  }
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await logout();
      renderAuthBar();
      renderView(activeView);
      showToast("Вы вышли из аккаунта.");
    });
  }
}

// --- Modals ---

function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("modal--open");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("modal--open");
}

function setupModals() {
  document.querySelectorAll(".modal__close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-close");
      const modal = target ? document.getElementById(target) : btn.closest(".modal");
      if (modal) modal.classList.remove("modal--open");
    });
  });

  document.querySelectorAll(".modal__backdrop").forEach((bd) => {
    bd.addEventListener("click", () => {
      const target = bd.getAttribute("data-close");
      const modal = target ? document.getElementById(target) : bd.closest(".modal");
      if (modal) modal.classList.remove("modal--open");
    });
  });
}

// --- Auth forms ---

function setupAuthForms() {
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const loginInput = document.getElementById("login-username");
      const passInput = document.getElementById("login-password");
      const errorEl = document.getElementById("login-error");
      errorEl.textContent = "";

      // For Supabase, login input must be an email address
      const email = loginInput.value.trim().toLowerCase();
      const password = passInput.value;

      if (!isValidEmail(email)) {
        errorEl.textContent = "Введите корректный Email.";
        return;
      }

      const res = await loginUser(email, password);
      if (!res.ok) {
        errorEl.textContent = res.error;
        return;
      }

      loginInput.value = "";
      passInput.value = "";
      closeModal("login-modal");
      renderAuthBar();
      await renderView(activeView);
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const loginInput = document.getElementById("register-username");
      const emailInput = document.getElementById("register-email");
      const passInput = document.getElementById("register-password");
      const passConfInput = document.getElementById("register-password2");
      const errorEl = document.getElementById("register-error");
      const successEl = document.getElementById("register-success");
      errorEl.textContent = "";
      successEl.textContent = "";

      const login = loginInput.value.trim();
      const email = emailInput.value.trim().toLowerCase();
      const password = passInput.value;
      const password2 = passConfInput.value;

      if (!isValidEmail(email)) {
        errorEl.textContent = "Введите корректный Email.";
        return;
      }

      if (password !== password2) {
        errorEl.textContent = "Пароли не совпадают.";
        return;
      }

      const res = await registerUser(login, email, password);

      if (!res.ok) {
        errorEl.textContent = res.error;
        return;
      }

      loginInput.value = "";
      emailInput.value = "";
      passInput.value = "";
      passConfInput.value = "";
      
      closeModal("register-modal");
      renderAuthBar();
      renderView(activeView);
      showToast("Успешная регистрация! Проверьте Email для подтверждения.");
    });
  }
}

// --- nav ---

function setupNav() {
  sidebarMenu.addEventListener("click", (e) => {
    const li = e.target.closest(".menu__item");
    if (!li) return;
    const view = li.getAttribute("data-view");
    if (!view) return;
    if (view === "admin" && !hasRole(ROLES.OWNER, ROLES.ADMIN)) {
      showToast("Доступ к админ-панели запрещен.");
      return;
    }
    setActiveMenuItem(view);
    renderView(view);
    if (window.innerWidth <= 900) {
      sidebarMenu.classList.remove("menu--open");
    }
  });

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      sidebarMenu.classList.toggle("menu--open");
    });
  }
}

function setActiveMenuItem(view) {
  activeView = view;
  document
    .querySelectorAll(".menu__item")
    .forEach((item) => item.classList.remove("menu__item--active"));
  const current = document.querySelector(`.menu__item[data-view="${view}"]`);
  if (current) current.classList.add("menu__item--active");
}

// --- views rendering ---

function requireAuthNotice() {
  return `
    <div class="notice notice--warning">
      Для отправки сообщений и жалоб необходимо войти в систему.
    </div>
  `;
}

function getCurrentLogin() {
  const session = getSession();
  return session ? session.login : null;
}

function getCurrentRole() {
  const session = getSession();
  return session ? session.role : null;
}

// News
async function getNews() {
  const { data, error } = await supabase
    .from("news")
    .select("*")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}

async function saveNews(list) {
  // Deprecated - use addNews or updateNews instead
  console.warn("saveNews is deprecated, use addNews");
}

async function addNews(title, text, image = "") {
  const author = currentUser?.user_metadata?.login || currentUser?.email || "Unknown";
  const { data, error } = await supabase
    .from("news")
    .insert([{
      title,
      content: text,
      image,
      author,
      created_at: new Date().toISOString()
    }])
    .select();
  return error ? { ok: false, error: error.message } : { ok: true, data };
}

async function deleteNews(id) {
  const { error } = await supabase
    .from("news")
    .delete()
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

// Treasury
async function getTreasury() {
  const { data, error } = await supabase
    .from("treasury")
    .select("*")
    .limit(1)
    .single();
  if (error) {
    return { title: '', image: '', goal: 0, current: 0, description: '', id: null };
  }
  return data || { title: '', image: '', goal: 0, current: 0, description: '', id: null };
}

async function saveTreasury(data) {
  const existing = await getTreasury();
  if (existing.id) {
    const { error } = await supabase
      .from("treasury")
      .update(data)
      .eq("id", existing.id);
    return error ? { ok: false } : { ok: true };
  } else {
    const { error } = await supabase
      .from("treasury")
      .insert([data]);
    return error ? { ok: false } : { ok: true };
  }
}

// Events
async function getEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: false });
  return error ? [] : (data || []);
}

async function saveEvents(list) {
  // Deprecated
  console.warn("saveEvents is deprecated");
}

async function addEvent(title, description, eventDate, location = "") {
  if (!eventDate) {
    return { ok: false, error: "Дата события обязательна." };
  }

  const eventPayload = {
    title,
    description,
    event_date: eventDate,
    location,
  };

  const { data, error } = await supabase
    .from("events")
    .insert([eventPayload])
    .select();

  return error ? { ok: false, error: error.message } : { ok: true, data };
}

async function deleteEvent(id) {
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

// Online Status
function pingOnline() {
  const login = getCurrentLogin();
  if (!login) return;
  const users = getUsers();
  const user = users.find(u => u.login === login);
  if (user) {
    user.lastSeen = new Date().toISOString();
    saveUsers(users);
  }
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) < 7 * 60 * 1000; // 7 minutes
}

// Home (News feed)
function renderHomeView() {
  const login = getCurrentLogin();
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN);
  const newsList = getNews().slice().reverse();

  let html = `
    <section class="view view-home">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <h2 style="margin:0;">Новости семьи</h2>
        ${isPrivileged ? '<button class="btn btn--primary" id="toggle-news-form" style="padding:6px 14px;">+ Новая новость</button>' : ''}
      </div>
  `;

  if (isPrivileged) {
    html += `
      <div id="news-form-wrap" style="display:none; margin-bottom:20px;">
        <div class="card" style="border: 1px solid #3b82f6;">
          <h3 style="margin-top:0;">Создать новость</h3>
          <div class="form__group"><label>Заголовок</label><input type="text" id="news-title-input" placeholder="Заголовок новости..." /></div>
          <div class="form__group"><label>Текст</label><textarea id="news-text-input" placeholder="Текст новости..."></textarea></div>
          <div class="form__group"><label>Фото (ссылка, необязательно)</label><input type="url" id="news-image-input" placeholder="https://..." /></div>
          <button class="btn btn--primary" id="news-submit-btn">Опубликовать</button>
        </div>
      </div>
    `;
  }

  if (newsList.length === 0) {
    html += `<div class="notice notice--info">Новостей пока нет. Администрация скоро что-нибудь напишет!</div>`;
  } else {
    for (const n of newsList) {
      html += `
        <div class="card" style="margin-bottom:16px; border-left: 4px solid #3b82f6; position:relative;">
          ${isPrivileged ? `<button class="btn btn--ghost delete-news-btn" data-news-id="${n.id}" style="position:absolute;top:10px;right:10px;padding:3px 8px;font-size:0.75rem;">×</button>` : ''}
          ${n.image ? `<img src="${escapeHtml(n.image)}" alt="Фото новости" style="width:100%;max-height:280px;object-fit:cover;border-radius:8px;margin-bottom:12px;" onerror="this.style.display='none'" />` : ''}
          <div style="font-size:0.75rem;color:#6b7280;margin-bottom:6px;">${new Date(n.date).toLocaleString()} • ${escapeHtml(n.author)}</div>
          <h3 style="margin:0 0 8px; color:#f8fafc;">${escapeHtml(n.title)}</h3>
          <p style="margin:0;color:#d1d5db;white-space:pre-wrap;">${escapeHtml(n.text)}</p>
        </div>
      `;
    }
  }

  html += `</section>`;
  mainContent.innerHTML = html;

  const toggleBtn = document.getElementById('toggle-news-form');
  const formWrap = document.getElementById('news-form-wrap');
  if (toggleBtn && formWrap) {
    toggleBtn.addEventListener('click', () => {
      formWrap.style.display = formWrap.style.display === 'none' ? 'block' : 'none';
    });
  }

  const submitBtn = document.getElementById('news-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const title = document.getElementById('news-title-input').value.trim();
      const text = document.getElementById('news-text-input').value.trim();
      const image = document.getElementById('news-image-input').value.trim();
      if (!title || !text) { showToast('Заголовок и текст обязательны.'); return; }
      const list = getNews();
      list.push({ id: Date.now(), title, text, image, author: login, date: new Date().toISOString() });
      saveNews(list);
      renderHomeView();
      showToast('Новость опубликована!');
    });
  }

  document.querySelectorAll('.delete-news-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-news-id'));
      if (!window.confirm('Удалить новость?')) return;
      saveNews(getNews().filter(n => n.id !== id));
      renderHomeView();
      showToast('Новость удалена.');
    });
  });
}

// Treasury (Общак)
function renderTreasuryView() {
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN);
  const t = getTreasury();
  const pct = t.goal > 0 ? Math.min(100, Math.round((t.current / t.goal) * 100)) : 0;

  const formatMoney = (n) => Number(n).toLocaleString('ru-RU') + ' $';

  let barColor = '#3b82f6';
  if (pct >= 100) barColor = '#10b981';
  else if (pct >= 60) barColor = '#f59e0b';

  let html = `
    <section class="view view-treasury">
      <h2>Общак семьи</h2>
      <p class="text-muted">Совместная копилка семьи на общую цель.</p>
  `;

  if (!t.title && !t.goal) {
    html += `<div class="notice notice--info">Цель ещё не задана. Администрация скоро её установит.</div>`;
  } else {
    html += `
      <div class="card" style="border: 1px solid #1e293b; padding: 0; overflow: hidden;">
        ${t.image ? `<img src="${escapeHtml(t.image)}" alt="Фото цели" style="width:100%; max-height:320px; object-fit:cover;" onerror="this.style.display='none'" />` : ''}
        <div style="padding: 20px;">
          <h3 style="margin: 0 0 6px; font-size:1.4rem; color:#f8fafc;">Цель: ${escapeHtml(t.title)}</h3>
          ${t.description ? `<p style="color:#9ca3af; margin: 0 0 16px;">${escapeHtml(t.description)}</p>` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="color:#d1d5db;">Собрано: <strong style="color:#f8fafc;">${formatMoney(t.current)}</strong></span>
            <span style="color:#d1d5db;">Цель: <strong style="color:#f8fafc;">${formatMoney(t.goal)}</strong></span>
          </div>
          <div style="background:#1e293b; border-radius:999px; height:20px; overflow:hidden; margin-bottom:8px;">
            <div style="width:${pct}%; background: linear-gradient(90deg, ${barColor}, ${barColor}cc); height:100%; border-radius:999px; transition: width 0.8s ease; display:flex; align-items:center; justify-content:center;">
              ${pct > 10 ? `<span style="font-size:0.75rem; font-weight:bold; color:#fff;">${pct}%</span>` : ''}
            </div>
          </div>
          ${pct <= 10 ? `<div style="text-align:right; font-size:0.8rem; color:#6b7280;">${pct}%</div>` : ''}
          ${pct >= 100 ? `<div class="notice notice--info" style="margin-top:12px;">Цель достигнута! Семья молодцы! 🎉</div>` : ''}
        </div>
      </div>
    `;
  }

  if (isPrivileged) {
    html += `
      <div class="card" style="margin-top:16px; border: 1px solid #334155;">
        <h3 style="margin-top:0;">⚙️ Управление общаком</h3>
        <div class="form__group"><label>Название цели</label><input type="text" id="t-title" value="${escapeHtml(t.title)}" placeholder="Например: Особняк на Вайнвуде" /></div>
        <div class="form__group"><label>Описание</label><input type="text" id="t-desc" value="${escapeHtml(t.description || '')}" placeholder="Краткое описание..." /></div>
        <div class="form__group"><label>Фото (ссылка на картинку)</label><input type="url" id="t-image" value="${escapeHtml(t.image || '')}" placeholder="https://..." /></div>
        <div class="form__group"><label>Сумма цели ($)</label><input type="number" id="t-goal" value="${t.goal || ''}" placeholder="10000000" min="1" /></div>
        <div class="form__group"><label>Текущая сумма ($)</label><input type="number" id="t-current" value="${t.current || ''}" placeholder="0" min="0" /></div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn--primary" id="t-save-btn">Сохранить цель</button>
          <button class="btn btn--primary" id="t-update-btn" style="background:#10b981;border-color:#10b981;">Обновить сумму</button>
        </div>
      </div>
    `;
  }

  html += `</section>`;
  mainContent.innerHTML = html;

  const saveBtn = document.getElementById('t-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const title = document.getElementById('t-title').value.trim();
      const desc = document.getElementById('t-desc').value.trim();
      const image = document.getElementById('t-image').value.trim();
      const goal = Number(document.getElementById('t-goal').value);
      const current = Number(document.getElementById('t-current').value);
      if (!title || !goal) { showToast('Название и цель обязательны.'); return; }
      saveTreasury({ title, description: desc, image, goal, current });
      renderTreasuryView();
      showToast('Цель обновлена!');
    });
  }

  const updateBtn = document.getElementById('t-update-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      const current = Number(document.getElementById('t-current').value);
      const existing = getTreasury();
      saveTreasury({ ...existing, current });
      renderTreasuryView();
      showToast('Сумма обновлена!');
    });
  }
}

// Events (Расписание)
function renderEventsView() {
  const login = getCurrentLogin();
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN);
  const events = getEvents().slice().reverse();

  let html = `
    <section class="view view-events">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
        <h2 style="margin:0;">События</h2>
        ${isPrivileged ? '<button class="btn btn--primary" id="toggle-event-form">+ Событие</button>' : ''}
      </div>
  `;

  if (isPrivileged) {
    html += `
      <div id="event-form-wrap" style="display:none; margin-bottom:20px;">
        <div class="card" style="border:1px solid #3b82f6;">
          <h3 style="margin-top:0;">Новое событие</h3>
          <div class="form__group"><label>Название</label><input type="text" id="ev-title" placeholder="Захват территории..." /></div>
          <div class="form__group"><label>Дата и время</label><input type="datetime-local" id="ev-date" /></div>
          <div class="form__group"><label>Описание</label><textarea id="ev-desc" placeholder="Подробности..."></textarea></div>
          <button class="btn btn--primary" id="ev-submit">Создать</button>
        </div>
      </div>
    `;
  }

  if (events.length === 0) {
    html += `<div class="notice notice--info">Нет запланированных событий.</div>`;
  } else {
    for (const ev of events) {
      const attending = ev.attendees || [];
      const iGo = login && attending.includes(login);
      const evDate = ev.eventDate ? new Date(ev.eventDate).toLocaleString() : 'Дата не указана';
      html += `
        <div class="card" style="margin-bottom:14px; border-left:4px solid #8b5cf6; position:relative;">
          ${isPrivileged ? `<button class="btn btn--ghost delete-event-btn" data-ev-id="${ev.id}" style="position:absolute;top:10px;right:10px;padding:3px 8px;font-size:0.75rem;">×</button>` : ''}
          <div style="font-size:0.8rem;color:#8b5cf6;font-weight:600;margin-bottom:6px;">📅 ${evDate}</div>
          <h3 style="margin:0 0 8px;">${escapeHtml(ev.title)}</h3>
          ${ev.description ? `<p style="color:#9ca3af;margin:0 0 12px;">${escapeHtml(ev.description)}</p>` : ''}
          ${login ? `
            <div style="display:flex; align-items:center; gap:12px;">
              <button class="btn ${iGo ? 'btn--primary' : 'btn--ghost'} ev-attend-btn" data-ev-id="${ev.id}" style="font-size:0.85rem; padding:5px 14px;">
                ${iGo ? '✔ Я буду' : 'Пойду!'}
              </button>
              <span style="color:#6b7280; font-size:0.85rem;">${attending.length} идут</span>
              ${isPrivileged && attending.length > 0 ? `<span style="font-size:0.8rem;color:#a5b4fc;">(${attending.map(escapeHtml).join(', ')})</span>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }
  }

  html += `</section>`;
  mainContent.innerHTML = html;

  const toggleBtn = document.getElementById('toggle-event-form');
  const formWrap = document.getElementById('event-form-wrap');
  if (toggleBtn && formWrap) {
    toggleBtn.addEventListener('click', () => {
      formWrap.style.display = formWrap.style.display === 'none' ? 'block' : 'none';
    });
  }

  const submitBtn = document.getElementById('ev-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const title = document.getElementById('ev-title').value.trim();
      const eventDate = document.getElementById('ev-date').value;
      const description = document.getElementById('ev-desc').value.trim();
      if (!title) { showToast('Название обязательно.'); return; }
      const list = getEvents();
      list.push({ id: Date.now(), title, eventDate, description, attendees: [], createdBy: login, date: new Date().toISOString() });
      saveEvents(list);
      renderEventsView();
      showToast('Событие создано!');
    });
  }

  document.querySelectorAll('.ev-attend-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!login) return;
      const id = Number(btn.getAttribute('data-ev-id'));
      const list = getEvents();
      const ev = list.find(e => e.id === id);
      if (!ev) return;
      ev.attendees = ev.attendees || [];
      if (ev.attendees.includes(login)) {
        ev.attendees = ev.attendees.filter(l => l !== login);
      } else {
        ev.attendees.push(login);
      }
      saveEvents(list);
      renderEventsView();
    });
  });

  document.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-ev-id'));
      if (!window.confirm('Удалить событие?')) return;
      saveEvents(getEvents().filter(e => e.id !== id));
      renderEventsView();
      showToast('Событие удалено.');
    });
  });
}

// Leaderboard
async function renderLeaderboardView() {
  const users = await getProfiles();
  const login = getCurrentLogin();

  let html = `
    <section class="view view-leaderboard">
      <h2>🏆 Участники</h2>
      <p class="text-muted">Список пользователей из Supabase.</p>
      <div style="max-width:800px;">
  `;

  users.forEach((u, i) => {
    const rank = i + 1;
    const isMe = u.login === login;
    html += `
      <div class="list-item" style="display:flex;align-items:center;gap:12px;${isMe ? 'border:1px solid #3b82f6;' : ''}">
        <div style="font-size:1.3rem;width:36px;text-align:center;">${rank}.</div>
        <div style="flex:1;">
          <div style="font-weight:600;">${renderUserLink(u.login)}</div>
          <div style="font-size:0.8rem;color:#6b7280;">${u.role || ROLES.USER}</div>
        </div>
        <div style="text-align:right; color:#9ca3af; font-size:0.85rem;">
          ${new Date(u.created_at).toLocaleDateString('ru-RU')}<br />
          ${u.email}
        </div>
      </div>
    `;
  });

  html += `</div></section>`;
  mainContent.innerHTML = html;
}

// Complaints
async function getComplaints() {
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}

async function saveComplaints(list) {
  // Deprecated
  console.warn("saveComplaints is deprecated");
}

async function addComplaint(title, text) {
  const author = currentUser?.user_metadata?.login || currentUser?.email || "Unknown";
  const { data, error } = await supabase
    .from("complaints")
    .insert([{
      title,
      content: text,
      author,
      status: "open",
      created_at: new Date().toISOString()
    }])
    .select();
  return error ? { ok: false } : { ok: true, data };
}

async function deleteComplaint(id) {
  const { error } = await supabase
    .from("complaints")
    .delete()
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

async function resolveComplaint(id) {
  const { error } = await supabase
    .from("complaints")
    .update({ status: "resolved" })
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

function renderComplaintsView() {
  const login = getCurrentLogin();
  const isOwner = hasRole(ROLES.OWNER);
  
  const currentUser = login ? getUsers().find(u => u.login === login) : null;
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN, ROLES.UNION_LEADER, ROLES.UNION_DEPUTY);
  const canWrite = isPrivileged || (currentUser && currentUser.canWriteTopics === true);

  let html = `
    <section class="view view-complaints">
      <h2>Жалобы</h2>
  `;

  if (!login) {
    html += requireAuthNotice();
  } else if (!canWrite) {
    html += `
      <div class="notice notice--warning">
        У вас нет доступа для создания жалоб. Попросите администратора открыть доступ.
      </div>
    `;
  } else {
    html += `
      <form class="form" id="complaints-form">
        <div class="form__group">
          <label>Имя</label>
          <input type="text" id="complaint-name" value="${login}" disabled />
        </div>
        <div class="form__group">
          <label>Текст жалобы</label>
          <textarea id="complaint-text" placeholder="Опишите ситуацию..."></textarea>
        </div>
        <div class="form__error" id="complaint-error"></div>
        <button type="submit" class="btn btn--primary">Отправить</button>
      </form>
    `;
  }

  const complaints = getComplaints().slice().reverse();
  html += `<div class="list" id="complaints-list">`;
  if (complaints.length === 0) {
    html += `<div class="text-muted">Жалоб пока нет.</div>`;
  } else {
    for (const c of complaints) {
      html += `
        <div class="list-item">
          <div class="list-item__meta" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span>${renderUserLink(c.name)} • ${new Date(c.date).toLocaleString()}</span>
            ${
              isOwner
                ? `<button class="btn btn--ghost delete-complaint-btn" data-complaint-id="${c.id}" style="padding:4px 10px;font-size:0.8rem;">Удалить</button>`
                : ""
            }
          </div>
          <div class="list-item__text">${escapeHtml(c.text)}</div>
        </div>
      `;
    }
  }
  html += `</div></section>`;

  mainContent.innerHTML = html;

  if (login && canWrite) {
    const form = document.getElementById("complaints-form");
    const textArea = document.getElementById("complaint-text");
    const errorEl = document.getElementById("complaint-error");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorEl.textContent = "";
      const text = textArea.value.trim();
      if (!text) {
        errorEl.textContent = "Текст жалобы не может быть пустым.";
        return;
      }
      if (text.length > 2000) {
        errorEl.textContent = "Текст жалобы слишком длинный.";
        return;
      }
      const list = getComplaints();
      list.push({
        id: Date.now(),
        name: login,
        text,
        date: new Date().toISOString(),
      });
      saveComplaints(list);
      renderComplaintsView();
      showToast("Жалоба отправлена.");
    });
  }

  if (isOwner) {
    document.querySelectorAll(".delete-complaint-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-complaint-id"));
        if (!id) return;
        if (!window.confirm("Удалить эту жалобу?")) return;
        const list = getComplaints();
        saveComplaints(list.filter((item) => item.id !== id));
        renderComplaintsView();
        showToast("Жалоба удалена.");
      });
    });
  }
}

// Unions

const UNIONS = [
  {
    id: "alpha",
    name: "Альянс 'Revolver-ПадшиеАнгелы'",
    description: "Стабильный стратегический союз с акцентом на оборону и координацию.",
    info: "Предпочтения: командная игра, защита союзников, участие в крупных событиях.",
    tableRows: [
      { label: "Статус", value: "Действующий союз" },
      { label: "Основное направление", value: "Оборона и поддержка" },
      { label: "Минимальные требования", value: "Соблюдение дисциплины, активность" },
    ],
  },
  {
    id: "omega",
    name: "Альянс 'Omega Pact'",
    description: "Атакующий союз, ориентированный на быстрые рейды и давление на оппонентов.",
    info: "Сильная координация лидеров, акцент на скорости принятия решений.",
    tableRows: [
      { label: "Статус", value: "Действующий союз" },
      { label: "Основное направление", value: "Атака и рейды" },
      { label: "Минимальные требования", value: "Опытные игроки, быстрый отклик" },
    ],
  },
  {
    id: "phoenix",
    name: "Альянс 'Phoenix Union'",
    description: "Дипломатический союз, специализирующийся на переговорах и урегулировании конфликтов.",
    info: "Поддерживает баланс сил и решает спорные ситуации между семьями.",
    tableRows: [
      { label: "Статус", value: "Потенциальный союз / переговоры" },
      { label: "Основное направление", value: "Дипломатия" },
      { label: "Минимальные требования", value: "Адекватность, коммуникабельность" },
    ],
  },
];

function getUnionComments() {
  // Legacy - not used in Supabase version
  return [];
}

function saveUnionComments(list) {
  // Legacy - deprecated
  console.warn("saveUnionComments is deprecated");
}

function renderUnionsView() {
  const login = getCurrentLogin();
  const isOwner = hasRole(ROLES.OWNER);
  if (!UNIONS.some((u) => u.id === activeUnionId)) {
    activeUnionId = UNIONS[0]?.id || null;
  }

  let html = `
    <section class="view view-unions">
      <h2>Союзы</h2>
      <p class="text-muted">Выберите союз слева, чтобы увидеть подробную информацию и оставить комментарий.</p>
      <div class="unions-layout">
        <aside class="unions-list">
  `;

  for (const u of UNIONS) {
    const activeClass = u.id === activeUnionId ? "unions-list__item--active" : "";
    html += `
      <div class="unions-list__item ${activeClass}" data-union-id="${u.id}">
        ${u.name}
      </div>
    `;
  }

  html += `</aside><div class="union-details" id="union-details"></div></div></section>`;

  mainContent.innerHTML = html;

  document.querySelectorAll(".unions-list__item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-union-id");
      activeUnionId = id;
      renderUnionsView();
    });
  });

  const details = document.getElementById("union-details");
  const union = UNIONS.find((u) => u.id === activeUnionId);
  if (!union) {
    details.innerHTML = `<div class="text-muted">Союз не найден.</div>`;
    return;
  }

  const comments = getUnionComments().filter((c) => c.unionId === union.id).slice().reverse();

  let commentsBlock = "";
  if (!login) {
    commentsBlock += requireAuthNotice();
  } else {
    commentsBlock += `
      <form class="form" id="union-comment-form">
        <div class="form__group">
          <label>Имя</label>
          <input type="text" id="union-comment-name" value="${login}" disabled />
        </div>
        <div class="form__group">
          <label>Комментарий</label>
          <textarea id="union-comment-text" placeholder="Напишите комментарий по союзу..."></textarea>
        </div>
        <div class="form__error" id="union-comment-error"></div>
        <button type="submit" class="btn btn--primary">Отправить</button>
      </form>
    `;
  }

  commentsBlock += `<div class="list" id="union-comments-list">`;
  if (comments.length === 0) {
    commentsBlock += `<div class="text-muted">Комментариев пока нет.</div>`;
  } else {
    for (const c of comments) {
      commentsBlock += `
        <div class="list-item">
          <div class="list-item__meta" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span>${renderUserLink(c.name)} • ${new Date(c.date).toLocaleString()}</span>
            ${
              isOwner
                ? `<button class="btn btn--ghost delete-union-comment-btn" data-comment-id="${c.id}" style="padding:4px 10px;font-size:0.8rem;">Удалить</button>`
                : ""
            }
          </div>
          <div class="list-item__text">${escapeHtml(c.text)}</div>
        </div>
      `;
    }
  }
  commentsBlock += `</div>`;

  details.innerHTML = `
    <h3>${union.name}</h3>
    <p style="margin-top:4px;">${union.description}</p>
    <div class="notice notice--info" style="margin-top:10px;">${union.info}</div>

    <h3>Информация</h3>
    <table class="table">
      <thead>
        <tr><th>Пункт</th><th>Описание</th></tr>
      </thead>
      <tbody>
        ${union.tableRows
          .map(
            (row) =>
              `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.value)}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>

    <h3>Комментарии</h3>
    ${commentsBlock}
  `;

  if (login) {
    const form = document.getElementById("union-comment-form");
    const textArea = document.getElementById("union-comment-text");
    const errorEl = document.getElementById("union-comment-error");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorEl.textContent = "";
      const text = textArea.value.trim();
      if (!text) {
        errorEl.textContent = "Комментарий не может быть пустым.";
        return;
      }
      if (text.length > 2000) {
        errorEl.textContent = "Комментарий слишком длинный.";
        return;
      }
      const list = getUnionComments();
      list.push({
        id: Date.now(),
        unionId: union.id,
        name: login,
        text,
        date: new Date().toISOString(),
      });
      saveUnionComments(list);
      renderUnionsView();
      showToast("Комментарий добавлен.");
    });
  }

  if (isOwner) {
    document.querySelectorAll(".delete-union-comment-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-comment-id"));
        if (!id) return;
        const ok = window.confirm("Удалить этот комментарий?");
        if (!ok) return;
        const list = getUnionComments();
        const updated = list.filter((item) => item.id !== id);
        saveUnionComments(updated);
        renderUnionsView();
        showToast("Комментарий удален.");
      });
    });
  }
}

// Ranks
function renderRanksView() {
  const ranks = [
    {
      rank: "2 Ранг",
      price: "100 тысяч",
      privileges:
        "Новый участник семьи. Проходит адаптацию, знакомится с правилами и участниками. Выполняет простые поручения и проявляет активность.",
    },
    {
      rank: "3 Ранг",
      price: "125 тысяч",
      privileges:
        "Проверенный участник семьи. Активно участвует в жизни, помогает другим и выполняет поручения старших.",
    },
    {
      rank: "4 Ранг",
      price: "175 тысяч",
      privileges:
        "Основной состав семьи. Участвует в мероприятиях, выездах и защите интересов семьи. Надёжный и активный игрок.",
    },
    {
      rank: "5 Ранг",
      price: "225 тысяч",
      privileges:
        "Опытный участник. Следит за порядком, помогает новичкам, может руководить небольшими действиями и контролировать состав.",
    },
    {
      rank: "6 Ранг",
      price: "8 миллионов",
      privileges:
        "Правая рука лидера. Управляет семьёй при отсутствии главы, принимает важные решения и следит за дисциплиной.",
    },
  ];

  mainContent.innerHTML = `
    <section class="view view-ranks">
      <h2>Цены на ранги</h2>
      <p class="text-muted">Нажмите на ранг, чтобы увидеть привилегии.</p>
      <table class="table">
        <thead>
          <tr><th>Ранг</th><th>Цена / условие</th></tr>
        </thead>
        <tbody>
          ${ranks
            .map(
              (r, i) =>
                `<tr class="rank-row" data-rank-index="${i}" style="cursor:pointer;"><td>${escapeHtml(
                  r.rank
                )}</td><td>${escapeHtml(r.price)}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div class="card" id="rank-privileges-card" style="margin-top:12px;">
        <h3 id="rank-privileges-title">${escapeHtml(ranks[0].rank)} — привилегии</h3>
        <p id="rank-privileges-text" style="margin-top:6px;">${escapeHtml(ranks[0].privileges)}</p>
      </div>
    </section>
  `;

  const titleEl = document.getElementById("rank-privileges-title");
  const textEl = document.getElementById("rank-privileges-text");
  const rows = document.querySelectorAll(".rank-row");
  rows.forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.getAttribute("data-rank-index"));
      const selected = ranks[idx];
      if (!selected) return;
      titleEl.textContent = `${selected.rank} — привилегии`;
      textEl.textContent = selected.privileges;
      rows.forEach((r) => {
        r.style.background = "";
      });
      row.style.background = "#111827";
    });
  });
}

// Senior staff
function renderSeniorView() {
  const members = [
    { name: "Revolver", role: "Глава семьи", division: "Общее руководство" },
    { name: "NightFox", role: "Заместитель главы", division: "Координация подразделений" },
    { name: "Kira", role: "Куратор НК-1", division: "Подразделение НК-1" },
    { name: "Storm", role: "Куратор ССО", division: "Подразделение ССО" },
  ];

  mainContent.innerHTML = `
    <section class="view view-senior">
      <h2>Старший состав</h2>
      <p class="text-muted">Люди, принимающие ключевые решения и отвечающие за дисциплину и развитие семьи.</p>
      <div class="cards">
        ${members
          .map(
            (m) => `
              <div class="card-person">
                <div class="card-person__name">${escapeHtml(m.name)}</div>
                <div class="card-person__role">${escapeHtml(m.role)}</div>
                <div class="card-person__division">${escapeHtml(m.division)}</div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

// NK-1
function renderNk1View() {
  mainContent.innerHTML = `
    <section class="view view-nk1">
      <h2>Подразделение НК-1</h2>
      <p class="text-muted">
        НК-1 — оперативное подразделение, занимающееся контролем порядка, сопровождением операций и реагированием на инциденты.
      </p>

      <h3>Старший состав</h3>
      <ul style="margin-top:4px; padding-left:18px;">
        <li>— Slavian_Danick — главный за присмотром НК-1</li>
        <li>— Vov_Klutoi — Лидер НК-1</li>
        <li>— Diego_Maktavish — Заместитель лидера НК-1</li>
      </ul>

      <h3>Задачи</h3>
      <ul style="margin-top:4px; padding-left:18px;">
        <li>— Контроль выполнения правил внутри семьи и союзов.</li>
        <li>— Реакция на жалобы и инциденты, проверка информации.</li>
        <li>— Сбор и анализ данных по конфликтам и нарушениям.</li>
      </ul>
    </section>
  `;
}

// SSO
function renderSsoView() {
  mainContent.innerHTML = `
    <section class="view view-sso">
      <h2>Подразделение ССО</h2>
      <p class="text-muted">
        ССО — специальное силовое отделение, выполняющее сложные рейды, поддержку союзов и ключевые боевые задачи.
      </p>

      <h3>Участники</h3>
      <ul style="margin-top:4px; padding-left:18px;">
        <li>— Slavian_Danick — Главный за присмотром подразделения ССО</li>
        <li>— Jsjs_Ueudjs— Лидер ССО</li>
        <li>— Afinogen_Seleznev — заместитель лидера ССО</li>
      </ul>

      <h3>Задачи</h3>
      <ul style="margin-top:4px; padding-left:18px;">
        <li>— Участие в ключевых боевых операциях.</li>
        <li>— Поддержка союзов в сложных ситуациях.</li>
        <li>— Планирование и проведение тактических рейдов.</li>
      </ul>
    </section>
  `;
}

// Forum (main)
async function getForumPosts() {
  const { data, error } = await supabase
    .from("forum_posts")
    .select("*, forum_replies(*)")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}

async function saveForumPosts(list) {
  console.warn("saveForumPosts is deprecated");
}

async function addForumPost(title, content) {
  const author = currentUser?.user_metadata?.login || currentUser?.email || "Unknown";
  const { data, error } = await supabase
    .from("forum_posts")
    .insert([{
      title,
      content,
      author,
      created_at: new Date().toISOString()
    }])
    .select();
  return error ? { ok: false } : { ok: true, data };
}

async function deleteForumPost(id) {
  const { error } = await supabase
    .from("forum_posts")
    .delete()
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

async function addForumReply(postId, content) {
  const author = currentUser?.user_metadata?.login || currentUser?.email || "Unknown";
  const { data, error } = await supabase
    .from("forum_replies")
    .insert([{
      post_id: postId,
      content,
      author,
      created_at: new Date().toISOString()
    }])
    .select();
  return error ? { ok: false } : { ok: true, data };
}

async function deleteForumReply(id) {
  const { error } = await supabase
    .from("forum_replies")
    .delete()
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

function renderForumView() {
  const login = getCurrentLogin();
  const isOwner = hasRole(ROLES.OWNER);
  
  const currentUser = login ? getUsers().find(u => u.login === login) : null;
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN, ROLES.UNION_LEADER, ROLES.UNION_DEPUTY);
  const canWrite = isPrivileged || (currentUser && currentUser.canWriteTopics === true);

  let html = `
    <section class="view view-forum">
      <h2>Форум</h2>
      <p class="text-muted">Общий форум семьи Revolver. Здесь обсуждаются внутриигровые события, предложения и объявления,а также правила.</p>
  `;

  if (!login) {
    html += requireAuthNotice();
  } else if (!canWrite) {
    html += `
      <div class="notice notice--warning">
        У вас нет доступа писать в Форум. Попросите администратора открыть вам доступ.
      </div>
    `;
  } else {
    html += `
      <form class="form" id="forum-form">
        <div class="form__group">
          <label>Имя</label>
          <input type="text" id="forum-name" value="${login}" disabled />
        </div>
        <div class="form__group">
          <label>Сообщение</label>
          <textarea id="forum-message" placeholder="Напишите сообщение..."></textarea>
        </div>
        <div class="form__error" id="forum-error"></div>
        <button type="submit" class="btn btn--primary">Отправить</button>
      </form>
    `;
  }

  const posts = getForumPosts().slice().reverse();
  html += `<div class="list" id="forum-messages">`;
  if (posts.length === 0) {
    html += `<div class="text-muted">Сообщений пока нет.</div>`;
  } else {
    for (const p of posts) {
      html += `
        <div class="list-item">
          <div class="list-item__meta" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span>${renderUserLink(p.name)} • ${new Date(p.date).toLocaleString()}</span>
            ${
              isOwner
                ? `<button class="btn btn--ghost delete-forum-post-btn" data-post-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;">Удалить</button>`
                : ""
            }
          </div>
          <div class="list-item__text">${escapeHtml(p.text)}</div>
        </div>
      `;
    }
  }
  html += `</div></section>`;

  mainContent.innerHTML = html;

  if (login && canWrite) {
    const form = document.getElementById("forum-form");
    const area = document.getElementById("forum-message");
    const errorEl = document.getElementById("forum-error");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorEl.textContent = "";
      const text = area.value.trim();
      if (!text) {
        errorEl.textContent = "Сообщение не может быть пустым.";
        return;
      }
      if (text.length > 2000) {
        errorEl.textContent = "Сообщение слишком длинное.";
        return;
      }
      const list = getForumPosts();
      list.push({
        id: Date.now(),
        name: login,
        text,
        date: new Date().toISOString(),
      });
      saveForumPosts(list);
      renderForumView();
      showToast("Сообщение отправлено.");
    });
  }

  if (isOwner) {
    document.querySelectorAll(".delete-forum-post-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-post-id"));
        if (!id) return;
        if (!window.confirm("Удалить это сообщение форума?")) return;
        const list = getForumPosts();
        saveForumPosts(list.filter((item) => item.id !== id));
        renderForumView();
        showToast("Сообщение удалено.");
      });
    });
  }
}

// Union forum (topics)

const UNION_FORUM_TOPICS = [
  { id: "complaints", label: "Жалобы" },
  { id: "active", label: "Действующие союзы" },
  { id: "leaders", label: "Лидеры и заместители союзов" },
];

async function getUnionForumPosts() {
  const { data, error } = await supabase
    .from("union_forum_posts")
    .select("*, union_forum_comments(*)")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}

async function saveUnionForumPosts(list) {
  console.warn("saveUnionForumPosts is deprecated");
}

async function addUnionForumPost(topic, content) {
  const author = currentUser?.user_metadata?.login || currentUser?.email || "Unknown";
  const { data, error } = await supabase
    .from("union_forum_posts")
    .insert([{
      topic,
      content,
      author,
      created_at: new Date().toISOString()
    }])
    .select();
  return error ? { ok: false } : { ok: true, data };
}

async function deleteUnionForumPost(id) {
  const { error } = await supabase
    .from("union_forum_posts")
    .delete()
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

async function addUnionForumComment(postId, content) {
  const author = currentUser?.user_metadata?.login || currentUser?.email || "Unknown";
  const { data, error } = await supabase
    .from("union_forum_comments")
    .insert([{
      post_id: postId,
      content,
      author,
      created_at: new Date().toISOString()
    }])
    .select();
  return error ? { ok: false } : { ok: true, data };
}

async function deleteUnionForumComment(id) {
  const { error } = await supabase
    .from("union_forum_comments")
    .delete()
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

function renderUnionForumView() {
  const login = getCurrentLogin();
  const isOwner = hasRole(ROLES.OWNER);
  const canWriteUnionForum = hasRole(
    ROLES.OWNER,
    ROLES.UNION_LEADER,
    ROLES.UNION_DEPUTY,
    ROLES.ADMIN
  );
  let html = `
    <section class="view view-union-forum">
      <h2>Форум союзов</h2>
      <p class="text-muted">Отдельный форум, посвящённый взаимодействию с союзами.</p>
      <div class="tabs" id="union-forum-tabs">
        ${UNION_FORUM_TOPICS.map(
          (t) => `
            <button class="tab ${t.id === activeUnionForumTopic ? "tab--active" : ""}" data-topic="${
            t.id
          }">${t.label}</button>
          `
        ).join("")}
      </div>
      <div class="tab-content" id="union-forum-content"></div>
    </section>
  `;

  mainContent.innerHTML = html;

  document.querySelectorAll("#union-forum-tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const topic = btn.getAttribute("data-topic");
      activeUnionForumTopic = topic;
      renderUnionForumView();
    });
  });

  const container = document.getElementById("union-forum-content");
  const topicDef = UNION_FORUM_TOPICS.find((t) => t.id === activeUnionForumTopic);
  const title = topicDef ? topicDef.label : "Тема";

  const allPosts = getUnionForumPosts().filter((p) => p.topic === activeUnionForumTopic);
  const posts = allPosts.slice().reverse();

  let inner = `
    <h3>${title}</h3>
  `;

  if (!login) {
    inner += requireAuthNotice();
  } else if (!canWriteUnionForum) {
    inner += `
      <div class="notice notice--warning">
        Писать в форум союзов могут только роли: глава союзов, заместитель союзов, admin и owner.
      </div>
    `;
  } else {
    inner += `
      <form class="form" id="union-forum-form">
        <div class="form__group">
          <label>Имя</label>
          <input type="text" id="union-forum-name" value="${login}" disabled />
        </div>
        <div class="form__group">
          <label>Сообщение</label>
          <textarea id="union-forum-message" placeholder="Напишите сообщение по теме '${title.toLowerCase()}'..."></textarea>
        </div>
        <div class="form__error" id="union-forum-error"></div>
        <button type="submit" class="btn btn--primary">Отправить</button>
      </form>
    `;
  }

  inner += `<div class="list" id="union-forum-messages">`;
  if (posts.length === 0) {
    inner += `<div class="text-muted">Сообщений в этой теме пока нет.</div>`;
  } else {
    for (const p of posts) {
      inner += `
        <div class="list-item">
          <div class="list-item__meta" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span>${renderUserLink(p.name)} • ${new Date(p.date).toLocaleString()}</span>
            ${
              isOwner
                ? `<button class="btn btn--ghost delete-union-forum-post-btn" data-post-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;">Удалить</button>`
                : ""
            }
          </div>
          <div class="list-item__text">${escapeHtml(p.text)}</div>
        </div>
      `;
    }
  }
  inner += `</div>`;

  container.innerHTML = inner;

  if (login && canWriteUnionForum) {
    const form = document.getElementById("union-forum-form");
    const area = document.getElementById("union-forum-message");
    const errorEl = document.getElementById("union-forum-error");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorEl.textContent = "";
      const text = area.value.trim();
      if (!text) {
        errorEl.textContent = "Сообщение не может быть пустым.";
        return;
      }
      if (text.length > 2000) {
        errorEl.textContent = "Сообщение слишком длинное.";
        return;
      }
      const list = getUnionForumPosts();
      list.push({
        id: Date.now(),
        topic: activeUnionForumTopic,
        name: login,
        text,
        date: new Date().toISOString(),
      });
      saveUnionForumPosts(list);
      renderUnionForumView();
      showToast("Сообщение отправлено.");
    });
  }

  if (isOwner) {
    document.querySelectorAll(".delete-union-forum-post-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-post-id"));
        if (!id) return;
        if (!window.confirm("Удалить сообщение из форума союзов?")) return;
        const list = getUnionForumPosts();
        saveUnionForumPosts(list.filter((item) => item.id !== id));
        renderUnionForumView();
        showToast("Сообщение удалено.");
      });
    });
  }
}

// Market
async function getMarketPosts() {
  const { data, error } = await supabase
    .from("market_listings")
    .select("*")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}

async function saveMarketPosts(list) {
  console.warn("saveMarketPosts is deprecated");
}

async function addMarketPost(title, content) {
  const author = currentUser?.user_metadata?.login || currentUser?.email || "Unknown";
  const { data, error } = await supabase
    .from("market_listings")
    .insert([{
      title,
      content,
      author,
      created_at: new Date().toISOString()
    }])
    .select();
  return error ? { ok: false } : { ok: true, data };
}

async function deleteMarketPost(id) {
  const { error } = await supabase
    .from("market_listings")
    .delete()
    .eq("id", id);
  return error ? { ok: false } : { ok: true };
}

function renderMarketView() {
  const login = getCurrentLogin();
  const isPrivileged = hasRole(ROLES.OWNER, ROLES.ADMIN);
  let html = `
    <section class="view view-market">
      <h2>Рынок</h2>
      <p class="text-muted">Раздел для публикации предложений о покупке, продаже или обмене.</p>
  `;

  if (!login) {
    html += requireAuthNotice();
  } else {
    html += `
      <form class="form" id="market-form">
        <div class="form__group">
          <label>Имя</label>
          <input type="text" id="market-name" value="${login}" disabled />
        </div>
        <div class="form__group">
          <label>Заголовок</label>
          <input type="text" id="market-title" placeholder="Краткое название..." />
        </div>
        <div class="form__group">
          <label>Описание</label>
          <textarea id="market-message" placeholder="Опишите ваше предложение..."></textarea>
        </div>
        <div class="form__error" id="market-error"></div>
        <button type="submit" class="btn btn--primary">Опубликовать</button>
      </form>
    `;
  }

  const allPosts = getMarketPosts().slice().reverse();
  const posts = isPrivileged 
    ? allPosts 
    : allPosts.filter(p => p.approved === true || p.name === login);

  html += `<div class="list" id="market-messages">`;
  if (posts.length === 0) {
    html += `<div class="text-muted">Объявлений пока нет.</div>`;
  } else {
    for (const p of posts) {
      const isPending = p.approved === false;
      const isRejected = p.approved === "rejected";
      
      let borderStyle = "";
      if (isPending) borderStyle = 'border-left: 4px solid #fbbf24;';
      else if (isRejected) borderStyle = 'border-left: 4px solid #ef4444; opacity: 0.65;';
      
      html += `
        <div class="list-item" style="${borderStyle}">
          <div class="list-item__meta" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span>${renderUserLink(p.name)} • ${new Date(p.date).toLocaleString()}</span>
              ${isPending ? '<span style="background: #fbbf24; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">Ожидает проверки</span>' : ''}
              ${isRejected ? '<span style="background: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">Отклонено</span>' : ''}
            </div>
            <div style="display:flex; gap: 8px;" id="post-actions-${p.id}">
            ${
              (isPrivileged && isPending)
                ? `<button class="btn btn--primary approve-market-post-btn" data-post-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;background:#10b981;border-color:#10b981;">Одобрить</button>`
                : ""
            }
            ${
              (isPrivileged && isPending)
                ? `<button class="btn btn--ghost open-reject-form-btn" data-post-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;">Отклонить</button>`
                : ""
            }
            ${
              (isPrivileged || p.name === login) && !isPending
                ? `<button class="btn btn--ghost delete-market-post-btn" data-post-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;">Удалить навсегда</button>`
                : ""
            }
            </div>
          </div>
          ${(isPrivileged && isPending) ? `
             <div id="reject-form-${p.id}" style="display:none; margin-top:8px; padding:10px; background:#1e293b; border-radius:8px;">
               <div style="font-size:0.85rem; margin-bottom:8px;">Выберите причину отклонения:</div>
               <select id="reject-select-${p.id}" style="padding:6px; margin-bottom:8px; width:100%; border-radius:4px; background:#0f172a; color:#fff; border:1px solid #334155;">
                 <option value="Не по форме">Не по форме</option>
                 <option value="Не актуально">Не актуально</option>
                 <option value="custom">Свой вариант...</option>
               </select>
               <input type="text" id="reject-custom-${p.id}" placeholder="Введите свой вариант..." style="display:none; width:100%; padding:6px; margin-bottom:8px; border-radius:4px; background:#0f172a; color:#fff; border:1px solid #334155;" />
               <div style="display:flex; gap:8px;">
                 <button class="btn btn--primary submit-reject-btn" data-post-id="${p.id}" style="padding:4px 10px; font-size:0.8rem; background:#ef4444; border-color:#ef4444;">Подтвердить</button>
                 <button class="btn btn--ghost cancel-reject-btn" data-post-id="${p.id}" style="padding:4px 10px; font-size:0.8rem;">Отмена</button>
               </div>
             </div>
          ` : ''}
          ${p.title ? `<div class="list-item__title" style="font-weight:600; margin-bottom:4px; margin-top: 8px;">${escapeHtml(p.title)}</div>` : ""}
          ${isRejected && p.rejectReason ? `<div style="font-size: 0.85rem; color: #fca5a5; margin-bottom: 8px; font-weight: 500;">Причина: ${escapeHtml(p.rejectReason)}</div>` : ''}
          <div class="list-item__text">${escapeHtml(p.text)}</div>
        </div>
      `;
    }
  }
  html += `</div></section>`;

  mainContent.innerHTML = html;

  if (login) {
    const form = document.getElementById("market-form");
    const titleInput = document.getElementById("market-title");
    const area = document.getElementById("market-message");
    const errorEl = document.getElementById("market-error");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorEl.textContent = "";
      const title = titleInput.value.trim();
      const text = area.value.trim();
      if (!title) {
        errorEl.textContent = "Заголовок не может быть пустым.";
        return;
      }
      if (!text) {
        errorEl.textContent = "Описание не может быть пустым.";
        return;
      }
      if (text.length > 2000) {
        errorEl.textContent = "Описание слишком длинное.";
        return;
      }
      const list = getMarketPosts();
      const isApproved = isPrivileged;
      list.push({
        id: Date.now(),
        name: login,
        title,
        text,
        date: new Date().toISOString(),
        approved: isApproved,
      });
      saveMarketPosts(list);
      renderMarketView();
      if (isApproved) {
        showToast("Объявление опубликовано.");
      } else {
        showToast("Объявление отправлено на модерацию.");
      }
    });
  }

  if (isPrivileged) {
    document.querySelectorAll(".approve-market-post-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-post-id"));
        if (!id) return;
        const list = getMarketPosts();
        const post = list.find(item => item.id === id);
        if (post) {
           post.approved = true;
           saveMarketPosts(list);
           renderMarketView();
           showToast("Объявление одобрено.");
        }
      });
    });

    document.querySelectorAll(".open-reject-form-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
         const id = btn.getAttribute("data-post-id");
         document.getElementById(`post-actions-${id}`).style.display = 'none';
         document.getElementById(`reject-form-${id}`).style.display = 'block';
         
         const select = document.getElementById(`reject-select-${id}`);
         const custom = document.getElementById(`reject-custom-${id}`);
         select.addEventListener('change', () => {
             custom.style.display = select.value === 'custom' ? 'block' : 'none';
         });
      });
    });

    document.querySelectorAll(".cancel-reject-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
         const id = btn.getAttribute("data-post-id");
         document.getElementById(`post-actions-${id}`).style.display = 'flex';
         document.getElementById(`reject-form-${id}`).style.display = 'none';
      });
    });

    document.querySelectorAll(".submit-reject-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
         const id = Number(btn.getAttribute("data-post-id"));
         const select = document.getElementById(`reject-select-${id}`);
         const custom = document.getElementById(`reject-custom-${id}`);
         let reason = select.value === 'custom' ? custom.value.trim() : select.value;
         
         if (!reason) reason = "Без причины";

         const list = getMarketPosts();
         const post = list.find(item => item.id === id);
         if (post) {
            post.approved = "rejected";
            post.rejectReason = reason;
            saveMarketPosts(list);

            const msgs = getMessages();
            msgs.push({
               id: Date.now(),
               from: login,
               to: post.name,
               text: `Ваше объявление "${post.title}" на рынке было отклонено. Причина: ${reason}`,
               date: new Date().toISOString()
            });
            saveMessages(msgs);

            renderMarketView();
            showToast("Объявление отклонено.");
         }
      });
    });
  }

  document.querySelectorAll(".delete-market-post-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-post-id"));
      if (!id) return;
      if (!window.confirm("Удалить навсегда?")) return;
      const list = getMarketPosts();
      saveMarketPosts(list.filter((item) => item.id !== id));
      renderMarketView();
      showToast("Удалено навсегда.");
    });
  });
}

// Profile
async function getProfileMessages() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`to.eq.${currentUser?.email},from.eq.${currentUser?.email}`)
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}

async function saveProfileMessages(list) {
  console.warn("saveProfileMessages is deprecated");
}

async function addProfileMessage(toUser, text) {
  const from = currentUser?.user_metadata?.login || currentUser?.email || "Unknown";
  const { data, error } = await supabase
    .from("messages")
    .insert([{
      from,
      to: toUser,
      text,
      created_at: new Date().toISOString()
    }])
    .select();
  return error ? { ok: false } : { ok: true, data };
}

async function deleteProfileMessage(id) {
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function getProfiles() {
  const client = getClient();
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}

async function getUnionComments() {
  const { data, error } = await supabase
    .from("union_forum_comments")
    .select("*")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []);
}

async function findProfileByLoginOrEmail(loginOrEmail) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .or(`login.eq.${loginOrEmail},email.eq.${loginOrEmail}`)
      .maybeSingle();
    return error ? null : data;
  } catch (err) {
    console.error("findProfileByLoginOrEmail error:", err);
    return null;
  }
}

async function renderProfileView() {
  const currentLogin = getCurrentLogin();
  
  if (!currentProfileUser) {
    if (!currentLogin) {
      mainContent.innerHTML = `
        <section class="view view-profile">
          <h2>Профиль</h2>
          ${requireAuthNotice()}
        </section>
      `;
      return;
    }
    currentProfileUser = currentLogin;
  }

  let user = null;

  if (currentLogin === currentProfileUser && currentUser) {
    user = {
      login: currentLogin,
      role: currentUser.user_metadata?.role || ROLES.USER,
      nickname: currentUser.user_metadata?.login || currentLogin,
      family: "Семья Revolver",
      avatar: "",
      email: currentUser.email
    };
  }

  if (!user) {
    const profile = await findProfileByLoginOrEmail(currentProfileUser);
    if (profile) {
      user = {
        login: profile.login,
        role: profile.role || ROLES.USER,
        nickname: profile.login,
        family: "Семья Revolver",
        avatar: "",
        email: profile.email
      };
    }
  }

  if (!user) {
    mainContent.innerHTML = `<section class="view view-profile"><h2>Профиль</h2><p class="text-muted">Пользователь не найден.</p></section>`;
    return;
  }

  const isMyProfile = currentLogin === user.login;
  const isOwner = hasRole(ROLES.OWNER);

  const roleLabels = {
    owner: "Владелец",
    admin: "Администратор",
    union_leader: "Глава союзов",
    union_deputy: "Заместитель",
    user: "Пользователь"
  };
  const roleColors = {
    owner: "linear-gradient(90deg, #7c3aed, #c026d3)",
    admin: "linear-gradient(90deg, #2563eb, #a855f7)",
    union_leader: "linear-gradient(90deg, #059669, #10b981)",
    union_deputy: "linear-gradient(90deg, #ea580c, #f97316)",
    user: "linear-gradient(90deg, #db2777, #f43f5e)"
  };

  const nickname = user.nickname || user.login;
  const family = user.family || "Семья Revolver";
  const avatarHtml = user.avatar 
    ? `<img src="${escapeHtml(user.avatar)}" style="width:140px; height:140px; border-radius:12px; object-fit:cover; border: 1px solid #1f2937;" />`
    : `<div style="width:140px; height:140px; border-radius:12px; background: #0ea5e9; display:flex; align-items:center; justify-content:center; font-size:60px; font-weight:bold; color:#fff;">${user.login.charAt(0).toUpperCase()}</div>`;

  const forumPosts = await getForumPosts();
  const marketPosts = await getMarketPosts();
  const forumMsgsCount = Array.isArray(forumPosts) ? forumPosts.filter(p => p.author === user.login).length : 0;
  const marketMsgsCount = Array.isArray(marketPosts) ? marketPosts.filter(p => p.author === user.login).length : 0;

  let html = `
    <section class="view view-profile" style="max-width: 900px; margin: 0 auto;">
      <div style="background: #111827; border-radius: 12px; border: 1px solid #1f2937; overflow: hidden; margin-bottom: 20px;">
        <div style="display:flex; flex-wrap:wrap; padding: 20px; gap: 20px; border-bottom: 1px solid #1f2937;">
          ${avatarHtml}
          <div style="flex:1; min-width: 200px; display:flex; flex-direction:column; justify-content:center;">
            <h2 style="font-size: 2rem; margin-bottom: 4px; color: #f8fafc;">${escapeHtml(nickname)}</h2>
            <div style="font-size: 0.9rem; color: #9ca3af; margin-bottom: 8px;">Логин: @${escapeHtml(user.login)}</div>
            <div style="display:inline-flex; align-self:flex-start; padding: 4px 12px; border-radius: 4px; font-weight:bold; font-size: 0.8rem; color:#fff; background: ${roleColors[user.role || 'user']}; margin-bottom: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
              ${roleLabels[user.role || 'user']}
            </div>
            <div style="color: #cbd5e1; font-size: 0.95rem;">${escapeHtml(family)}</div>
          </div>
        </div>
        <div style="display:flex; padding: 12px 20px; background: #0f172a; gap: 40px; border-bottom: 1px solid #1f2937;">
          <div style="text-align:center;">
            <div style="font-size: 0.8rem; color: #9ca3af; text-transform:uppercase;">Сообщения форума</div>
            <div style="font-size: 1.2rem; font-weight: bold;">${forumMsgsCount}</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size: 0.8rem; color: #9ca3af; text-transform:uppercase;">Рынок</div>
            <div style="font-size: 1.2rem; font-weight: bold;">${marketMsgsCount}</div>
          </div>
        </div>
      </div>
  `;

  if (isMyProfile) {
    html += `
      <div class="card" style="margin-bottom: 20px;">
        <h3>Редактировать профиль</h3>
        <div class="notice notice--info">Редактирование профиля пока не поддерживается в Supabase-модели.</div>
      </div>
    `;
  }

  html += `
    <h3>Сообщения профиля</h3>
  `;

  const allMessages = await getProfileMessages();
  const wallMsgs = (allMessages || []).filter(m => (m.to === user.login || m.targetUser === user.login));

  if (!currentLogin) {
    html += requireAuthNotice();
  } else {
    html += `
      <form class="form" id="profile-msg-form">
        <div class="form__group">
          <textarea id="profile-msg-text" placeholder="Оставьте сообщение на стене пользователя..." rows="3"></textarea>
        </div>
        <div class="form__error" id="profile-msg-error"></div>
        <button type="submit" class="btn btn--primary">Отправить сообщение</button>
      </form>
    `;
  }

  html += `<div class="list" id="profile-messages-list">`;
  if (wallMsgs.length === 0) {
    html += `<div class="text-muted" style="margin-top:10px;">На стене пока нет сообщений.</div>`;
  } else {
    for (const m of wallMsgs.slice().reverse()) {
      const author = m.from || m.name || "Unknown";
      const date = m.created_at || m.date || new Date().toISOString();
      html += `
        <div class="list-item">
          <div class="list-item__meta" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span>${renderUserLink(author)} • ${new Date(date).toLocaleString()}</span>
            ${
              (isOwner || isMyProfile)
                ? `<button class="btn btn--ghost delete-profile-msg-btn" data-msg-id="${m.id}" style="padding:4px 10px;font-size:0.8rem;">Удалить</button>`
                : ""
            }
          </div>
          <div class="list-item__text">${escapeHtml(m.text)}</div>
        </div>
      `;
    }
  }
  html += `</div></section>`;

  mainContent.innerHTML = html;

  if (currentLogin) {
    const pForm = document.getElementById("profile-msg-form");
    if (pForm) {
      const errEl = document.getElementById("profile-msg-error");
      const txtEl = document.getElementById("profile-msg-text");
      pForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        errEl.textContent = "";
        const text = txtEl.value.trim();
        if (!text) return;
        if (text.length > 2000) { errEl.textContent = "Слишком длинное сообщение."; return; }

        const res = await addProfileMessage(user.login, text);
        if (!res.ok) {
          showToast(res.error || "Не удалось отправить сообщение.");
          return;
        }

        await renderProfileView();
        showToast("Сообщение опубликовано.");
      });
    }
  }

  if (isOwner || isMyProfile) {
    document.querySelectorAll(".delete-profile-msg-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.getAttribute("data-msg-id"));
        if (!id) return;
        if (!window.confirm("Удалить сообщение?")) return;
        const res = await deleteProfileMessage(id);
        if (!res.ok) {
          showToast(res.error || "Не удалось удалить сообщение.");
          return;
        }
        await renderProfileView();
        showToast("Удалено.");
      });
    });
  }
}


  // Add event listeners
  document.querySelectorAll(".message-user-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeMessageUser = btn.getAttribute("data-login");
      renderMessagesView();
    });
  });

// Debounced search function
function createDebouncedSearch(callback, delay = 300) {
  let timeout;
  return function(event) {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(event), delay);
  };
}

// Messages search with debouncing
const messagesSearch = document.getElementById("messages-search");
if (messagesSearch) {
  const debouncedMessageSearch = createDebouncedSearch((e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".message-user-btn").forEach(item => {
      const login = item.getAttribute("data-login").toLowerCase();
      if (login.includes(q)) {
        item.style.display = "";
      } else {
        item.style.display = "none";
      }
    });
  });
  messagesSearch.addEventListener("input", debouncedMessageSearch);
}

  const chatHistory = document.getElementById("chat-history");
  if (chatHistory) {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  const form = document.getElementById("messages-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("messages-input");
      const text = input.value.trim();
      if (!text || !activeMessageUser) return;
      if (text.length > 2000) {
        showToast("Сообщение слишком длинное.");
        return;
      }
      
      const list = getMessages();
      list.push({
        id: Date.now(),
        from: login,
        to: activeMessageUser,
        text,
        date: new Date().toISOString()
      });
      saveMessages(list);
      renderMessagesView();
    });
  }


async function renderAdminView() {
  if (!hasRole(ROLES.OWNER, ROLES.ADMIN)) {
    mainContent.innerHTML = `
      <section class="view view-admin">
        <h2>Блок управления</h2>
        <div class="notice notice--warning">У вас нет доступа к этому разделу.</div>
      </section>
    `;
    return;
  }

  const currentLogin = getCurrentLogin();
  const isOwner = hasRole(ROLES.OWNER);
  const users = await getProfiles();
  const complaints = await getComplaints();
  const forumPosts = await getForumPosts();
  const unionForumPosts = await getUnionForumPosts();
  const unionComments = await getUnionComments();
  const marketPosts = await getMarketPosts();

  let html = `
    <section class="view view-admin">
      <h2>Блок управления</h2>
      <p class="text-muted">Доступно владельцу и админам. Здесь отображаются данные из Supabase.</p>
      <div class="cards" style="margin-top:10px;">
        <div class="card-person"><div class="card-person__name">Пользователи</div><div class="card-person__role">${users.length}</div></div>
        <div class="card-person"><div class="card-person__name">Жалобы</div><div class="card-person__role">${complaints.length}</div></div>
        <div class="card-person"><div class="card-person__name">Форум</div><div class="card-person__role">${forumPosts.length}</div></div>
        <div class="card-person"><div class="card-person__name">Форум союзов</div><div class="card-person__role">${unionForumPosts.length}</div></div>
        <div class="card-person"><div class="card-person__name">Комментарии союзов</div><div class="card-person__role">${unionComments.length}</div></div>
        <div class="card-person"><div class="card-person__name">Рынок</div><div class="card-person__role">${marketPosts.length}</div></div>
      </div>
      <div class="card" style="margin-top:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
           <h3 style="margin:0;">Пользователи</h3>
           <input type="text" id="admin-search" placeholder="Поиск по нику..." style="padding: 6px 12px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #fff; width: 250px;" autocomplete="off" />
        </div>
        <div class="list">
  `;

  for (const user of users) {
    const isSelf = user.login === currentLogin;
    const roleLabel = user.role || ROLES.USER;
    html += `
      <div class="list-item admin-user-item" data-login="${escapeHtml(user.login)}">
        <div class="list-item__meta">${escapeHtml(user.login)} • ${escapeHtml(user.email || "email не указан")}</div>
        <div class="list-item__text" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>Роль: <strong>${escapeHtml(roleLabel)}</strong></span>
          ${isSelf ? `<span class="text-muted">Это ваш аккаунт</span>` : ""}
        </div>
      </div>
    `;
  }

  html += `
        </div>
      </div>
    </section>
  `;

  mainContent.innerHTML = html;

  const adminSearch = document.getElementById("admin-search");
  if (adminSearch) {
    const debouncedAdminSearch = createDebouncedSearch((e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll(".admin-user-item").forEach(item => {
        const login = item.getAttribute("data-login").toLowerCase();
        if (login.includes(q)) {
          item.style.display = "";
        } else {
          item.style.display = "none";
        }
      });
    });
    adminSearch.addEventListener("input", debouncedAdminSearch);
  }
}

// --- Router ---

async function renderView(view) {
  try {
    switch (view) {
      case "home":
        await renderHomeViewAsync();
        break;
      case "complaints":
        await renderComplaintsViewAsync();
        break;
      case "treasury":
        await renderTreasuryViewAsync();
        break;
      case "events":
        await renderEventsViewAsync();
        break;
      // Fallback to old render functions for other views
      case "unions":
        renderUnionsView();
        break;
      case "ranks":
        renderRanksView();
        break;
      case "senior":
        renderSeniorView();
        break;
      case "nk1":
        renderNk1View();
        break;
      case "sso":
        renderSsoView();
        break;
      case "forum":
        const forumView = await renderForum();
        const main = document.getElementById("main-content");
        main.innerHTML = "";
        main.appendChild(forumView);
        break;
      case "union-forum":
        await renderUnionForumViewAsync();
        break;
      case "market":
        await renderMarketViewAsync();
        break;
      case "profile":
        if (!currentProfileUser && getCurrentLogin()) currentProfileUser = getCurrentLogin();
        await renderProfileView();
        break;
      case "admin":
        await renderAdminView();
        break;
      case "leaderboard":
        await renderLeaderboardView();
        break;
      default:
        await renderHomeViewAsync();
    }
  } catch (error) {
    console.error('Render error:', error);
    showToast('Ошибка при загрузке страницы');
  }
}

// --- Utils ---

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- init ---

document.addEventListener("DOMContentLoaded", () => {
  (async () => {
    // Initialize Supabase auth
    await initAuth();
    
    // Setup UI
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        // Refresh data when tab becomes visible
        renderAuthBar();
        renderView(activeView);
      }
    });

    renderAuthBar();
    setupModals();
    setupAuthForms();
    setupNav();
    setActiveMenuItem("home");
    await renderView("home");
  })();
});
function normalizeForumTopic(topic = {}) {
  return {
    ...topic,
    content: topic.content ?? topic.text ?? "",
    author: topic.author ?? topic.name ?? "",
    created_at: topic.created_at ?? topic.date ?? new Date().toISOString(),
  };
}

function normalizeForumPost(post = {}) {
  return {
    ...post,
    content: post.content ?? post.text ?? "",
    author: post.author ?? post.name ?? "",
    created_at: post.created_at ?? post.date ?? new Date().toISOString(),
  };
}

async function loadTopics() {
  const { data, error } = await supabase
    .from("forum_posts")
    .select("*")
    .order("created_at", { ascending: false });
  return error ? [] : (data || []).map(normalizeForumTopic);
}

async function createTopic(title) {
  if (!currentUser) {
    return { ok: false, error: "Требуется вход в систему." };
  }
  const author = currentUser.user_metadata?.login || currentUser.email || "Unknown";
  const timestamp = new Date().toISOString();
  const payloads = [
    { title, content: "", author, created_at: timestamp },
    { title, text: "", name: author, date: timestamp },
  ];

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from("forum_posts")
      .insert([payload])
      .select();
    if (!error) {
      return { ok: true, data };
    }
    const message = (error.message || "").toLowerCase();
    if (!message.includes("author") && !message.includes("created_at") && !message.includes("content") && !message.includes("name") && !message.includes("text") && !message.includes("date")) {
      return { ok: false, error: error.message };
    }
  }

  return { ok: false, error: "Не удалось создать тему. Проверьте схему таблицы forum_posts." };
}

async function loadPosts(topicId) {
  const { data, error } = await supabase
    .from("forum_replies")
    .select("*")
    .eq("post_id", topicId)
    .order("created_at", { ascending: true });
  return error ? [] : (data || []).map(normalizeForumPost);
}

async function createPost(topicId, content) {
  if (!currentUser) {
    return { ok: false, error: "Требуется вход в систему." };
  }
  const author = currentUser.user_metadata?.login || currentUser.email || "Unknown";
  const timestamp = new Date().toISOString();
  const payloads = [
    { post_id: topicId, content, author, created_at: timestamp },
    { post_id: topicId, text: content, name: author, date: timestamp },
  ];

  for (const payload of payloads) {
    const { data, error } = await supabase
      .from("forum_replies")
      .insert([payload])
      .select();
    if (!error) {
      return { ok: true, data };
    }
    const message = (error.message || "").toLowerCase();
    if (!message.includes("author") && !message.includes("created_at") && !message.includes("content") && !message.includes("name") && !message.includes("text") && !message.includes("date")) {
      return { ok: false, error: error.message };
    }
  }

  return { ok: false, error: "Не удалось отправить сообщение. Проверьте схему таблицы forum_replies." };
}

async function renderForum() {
  const login = getCurrentLogin();
  const topics = await loadTopics();

  const container = document.createElement("div");
  container.className = "view";

  container.innerHTML = `
    <h2>Форум</h2>
    <div class="card" style="margin-bottom:16px;">
      <input id="new-topic-title" placeholder="Название темы" />
      <button id="create-topic-btn" class="btn btn--primary">Создать тему</button>
    </div>
    <div id="topics-list" class="list"></div>
  `;

  const list = container.querySelector("#topics-list");

  topics.forEach(t => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div class="list-item__text">${escapeHtml(t.title)}</div>
      <div class="list-item__meta">${new Date(t.created_at).toLocaleString()}</div>
    `;

    item.onclick = () => openTopic(t.id, t.title);
    list.appendChild(item);
  });

  const createBtn = container.querySelector("#create-topic-btn");
  if (createBtn) {
    createBtn.onclick = async () => {
      const titleEl = container.querySelector("#new-topic-title");
      const title = titleEl.value.trim();
      if (!title) {
        showToast("Введите название темы.");
        return;
      }
      if (!login) {
        showToast("Требуется вход в систему.");
        return;
      }
      const res = await createTopic(title);
      if (!res.ok) {
        showToast(res.error);
        return;
      }
      titleEl.value = "";
      await renderView("forum");
    };
  }

  return container;
}

async function openTopic(topicId, title) {
  const posts = await loadPosts(topicId);

  const container = document.createElement("div");
  container.className = "view";

  container.innerHTML = `
    <button id="back-btn" class="btn">← Назад</button>
    <h2>${escapeHtml(title)}</h2>
    <div id="posts-list" class="list"></div>
    <div class="card" style="margin-top:16px;">
      <textarea id="new-post" placeholder="Написать сообщение"></textarea>
      <button id="send-post" class="btn btn--primary">Отправить</button>
    </div>
  `;

  const list = container.querySelector("#posts-list");

  function renderPosts(posts) {
    list.innerHTML = "";
    posts.forEach(p => {
      const el = document.createElement("div");
      el.className = "list-item";
      el.innerHTML = `
        <div class="list-item__text">${escapeHtml(p.content)}</div>
        <div class="list-item__meta">${new Date(p.created_at).toLocaleString()}</div>
      `;
      list.appendChild(el);
    });
  }

  renderPosts(posts);

  container.querySelector("#send-post").onclick = async () => {
    const text = container.querySelector("#new-post").value.trim();
    if (!text) return;

    const res = await createPost(topicId, text);
    if (!res.ok) {
      showToast(res.error);
      return;
    }
    container.querySelector("#new-post").value = "";
    const updatedPosts = await loadPosts(topicId);
    renderPosts(updatedPosts);
  };

  container.querySelector("#back-btn").onclick = () => renderView("forum");

  document.getElementById("main-content").innerHTML = "";
  document.getElementById("main-content").appendChild(container);
}
