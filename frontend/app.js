nano frontend/app.js
// URL DE TU API (BACKEND WORKER)
const API_URL = "https://valet-eye.ncarrillok.workers.dev";

// Navegación simple
function show(screen) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(screen).classList.add("active");
}

// Verificar token al cargar la app
async function checkSession() {
  const token = localStorage.getItem("token");
  if (!token) {
    show("login-screen");
    return;
  }

  // Verificar token con el backend
  const res = await fetch(`${API_URL}/auth/verify`, {
    headers: { "Authorization": "Bearer " + token }
  });

  if (!res.ok) {
    // Token inválido → limpiar y volver al login
    localStorage.removeItem("token");
    show("login-screen");
    return;
  }

  // Token válido → ir al home
  show("home-screen");
}

// Ejecutar al cargar
checkSession();

// LOGIN
document.getElementById("btn-login").onclick = async () => {
  const username = document.getElementById("login-user").value;
  const password = document.getElementById("login-pass").value;

  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();

  if (!res.ok) {
    document.getElementById("login-error").textContent = data.error || "Error";
    return;
  }

  localStorage.setItem("token", data.token);
  userRole = data.role;

  show("home-screen");
};

// LOGOUT
document.getElementById("btn-logout").onclick = () => {
  localStorage.removeItem("token");
  show("login-screen");
};

// CHECK-IN
document.getElementById("btn-checkin").onclick = () => show("checkin-screen");

document.getElementById("btn-save-checkin").onclick = async () => {
  const plate = document.getElementById("plate").value;
  const driver = document.getElementById("driver").value;

  const res = await fetch(`${API_URL}/events/checkin`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify({ plate, driver })
  });

  const data = await res.json();
  document.getElementById("checkin-msg").textContent = data.message || "Guardado";
};

// DASHBOARD
document.getElementById("btn-dashboard").onclick = async () => {
  show("dashboard-screen");

  const res = await fetch(`${API_URL}/dashboard/today`, {
    headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
  });

  const data = await res.json();

  documentconst API_URL = "https://valet-parking.ncarrillok.workers.dev";

