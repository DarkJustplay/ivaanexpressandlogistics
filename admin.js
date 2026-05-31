const $ = (id) => document.getElementById(id);

const state = {
  packages: [],
  health: { hasApiKey: false, demoMode: true },
  search: "",
  status: "all",
};

const STATUS_LABELS = {
  booked: "Booked",
  "picked-up": "Picked Up",
  "in-transit": "In Transit",
  "out-for-delivery": "Out for Delivery",
  delivered: "Delivered",
  exception: "Exception",
};

const ICONS = {
  refresh: `<svg viewBox="0 0 24 24"><path d="M20 6v6h-6"/><path d="M4 18v-6h6"/><path d="M20 12a8 8 0 0 0-14.8-4"/><path d="M4 12a8 8 0 0 0 14.8 4"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>`,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function normalizeAwb(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function checkHealth() {
  try {
    state.health = await requestJson("/api/health", { method: "GET" });
  } catch {
    state.health = { hasApiKey: false, demoMode: true };
  }
  const pill = $("adminBridge");
  pill.classList.toggle("live", Boolean(state.health.hasApiKey));
  pill.classList.toggle("warn", !state.health.hasApiKey);
  pill.lastChild.textContent = "Dashboard";
}

async function checkSession() {
  if (location.protocol === "file:") {
    showLogin();
    showToast("Run npm start to use Admin");
    return;
  }

  try {
    const session = await requestJson("/api/admin/session", { method: "GET" });
    if (session.authenticated) {
      showDashboard();
      await Promise.all([checkHealth(), loadPackages()]);
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  $("loginView").classList.remove("hidden");
  $("dashboardView").classList.add("hidden");
}

function showDashboard() {
  $("loginView").classList.add("hidden");
  $("dashboardView").classList.remove("hidden");
}

function filteredPackages() {
  const query = state.search.toLowerCase();
  return state.packages.filter((pkg) => {
    const haystack = [
      pkg.awb,
      pkg.customer,
      pkg.origin?.city,
      pkg.destination?.city,
      pkg.status,
      pkg.internalNote,
    ].join(" ").toLowerCase();
    const statusMatch = state.status === "all" || pkg.status === state.status;
    return statusMatch && (!query || haystack.includes(query));
  });
}

function updateSummary() {
  const total = state.packages.length;
  const visible = filteredPackages().length;
  $("packageSummary").textContent = total === visible
    ? `${total} package${total === 1 ? "" : "s"} under management`
    : `${visible} of ${total} packages shown`;
}

function renderRows() {
  const rows = filteredPackages();
  updateSummary();
  $("packageRows").innerHTML = rows.length ? rows.map((pkg) => `
    <tr>
      <td><strong>${escapeHtml(pkg.awb)}</strong></td>
      <td>
        <strong>${escapeHtml(pkg.customer || "Customer")}</strong>
        <div>${escapeHtml(pkg.internalNote || "")}</div>
      </td>
      <td>${escapeHtml(pkg.origin?.city || "--")} -> ${escapeHtml(pkg.destination?.city || "--")}</td>
      <td>
        <select class="status-select" data-action="status" data-awb="${escapeHtml(pkg.awb)}">
          ${Object.entries(STATUS_LABELS).map(([value, label]) => `
            <option value="${value}" ${pkg.status === value ? "selected" : ""}>${label}</option>
          `).join("")}
        </select>
      </td>
      <td>${escapeHtml(formatUpdated(pkg.updatedAt))}</td>
      <td>
        <div class="row-actions">
          <button class="icon-button" data-action="refresh" data-awb="${escapeHtml(pkg.awb)}" title="Refresh ${escapeHtml(pkg.awb)}">${ICONS.refresh}</button>
          <button class="icon-button danger" data-action="remove" data-awb="${escapeHtml(pkg.awb)}" title="Remove ${escapeHtml(pkg.awb)}">${ICONS.trash}</button>
        </div>
      </td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="6">
        <strong>No packages found</strong>
        <div>Add one below, or clear your filters.</div>
      </td>
    </tr>
  `;
}

function formatUpdated(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

async function loadPackages() {
  const payload = await requestJson("/api/admin/packages", { method: "GET" });
  state.packages = payload.packages || [];
  renderRows();
}

async function login(password) {
  await requestJson("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  showDashboard();
  await Promise.all([checkHealth(), loadPackages()]);
  showToast("Dashboard unlocked");
}

async function logout() {
  await requestJson("/api/admin/logout", { method: "POST", body: "{}" });
  state.packages = [];
  showLogin();
  showToast("Signed out");
}

async function addPackage(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  data.awb = normalizeAwb(data.awb);
  if (!data.awb) {
    showToast("AWB number is required");
    return;
  }
  const payload = await requestJson("/api/admin/packages", {
    method: "POST",
    body: JSON.stringify(data),
  });
  state.packages = payload.packages || [];
  renderRows();
  form.reset();
  form.status.value = "in-transit";
  showToast(`${data.awb} added`);
}

async function updateStatus(awb, status) {
  const payload = await requestJson(`/api/admin/packages/${encodeURIComponent(awb)}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
  state.packages = payload.packages || [];
  renderRows();
  showToast(`${awb} set to ${STATUS_LABELS[status] || status}`);
}

async function refreshPackage(awb) {
  const payload = await requestJson(`/api/admin/packages/${encodeURIComponent(awb)}/refresh`, {
    method: "POST",
    body: "{}",
  });
  state.packages = payload.packages || [];
  renderRows();
  showToast(payload.live ? `${awb} refreshed live` : `${awb} refreshed in demo mode`);
}

async function removePackage(awb) {
  const confirmed = window.confirm(`Remove ${awb} from your private dashboard?`);
  if (!confirmed) return;
  const payload = await requestJson(`/api/admin/packages/${encodeURIComponent(awb)}`, {
    method: "DELETE",
  });
  state.packages = payload.packages || [];
  renderRows();
  showToast(`${awb} removed`);
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("passwordInput").value;
  try {
    await login(password);
  } catch (error) {
    showToast(error.message || "Login failed");
  }
});

$("logoutButton").addEventListener("click", () => {
  logout().catch((error) => showToast(error.message || "Logout failed"));
});

$("packageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await addPackage(event.currentTarget);
  } catch (error) {
    showToast(error.message || "Could not add package");
  }
});

$("searchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderRows();
});

$("statusFilter").addEventListener("change", (event) => {
  state.status = event.target.value;
  renderRows();
});

$("refreshAllButton").addEventListener("click", async () => {
  const rows = filteredPackages();
  if (!rows.length) {
    showToast("No packages to refresh");
    return;
  }
  $("refreshAllButton").disabled = true;
  try {
    for (const pkg of rows) {
      await refreshPackage(pkg.awb);
    }
    showToast("Visible packages refreshed");
  } catch (error) {
    showToast(error.message || "Refresh failed");
  } finally {
    $("refreshAllButton").disabled = false;
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const awb = button.dataset.awb;
  if (button.dataset.action === "refresh") {
    refreshPackage(awb).catch((error) => showToast(error.message || "Refresh failed"));
  }
  if (button.dataset.action === "remove") {
    removePackage(awb).catch((error) => showToast(error.message || "Remove failed"));
  }
});

document.addEventListener("change", (event) => {
  const select = event.target.closest("[data-action='status']");
  if (!select) return;
  updateStatus(select.dataset.awb, select.value).catch((error) => {
    showToast(error.message || "Status update failed");
    loadPackages().catch(() => {});
  });
});

checkSession();
