const $ = s => document.querySelector(s);
let tab = "login", currentUser = null, bet = 10;

async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2600);
}
function showUser(user) {
  currentUser = user;
  $("#balance").textContent = Number(user.balance).toLocaleString() + " credits";
  $("#userLabel").textContent = user.username;
  $("#authForm").classList.add("hidden");
  $("#loggedIn").classList.remove("hidden");
  $("#welcomeText").textContent = `Signed in as ${user.username} (${user.email})`;
  $("#adminBtn").classList.toggle("hidden", user.role !== "admin");
}
function signedOut() {
  currentUser = null;
  $("#balance").textContent = "—";
  $("#userLabel").textContent = "Not logged in";
  $("#authForm").classList.remove("hidden");
  $("#loggedIn").classList.add("hidden");
  $("#adminPanel").classList.add("hidden");
}
async function refresh() {
  try { const d = await api("/api/me"); showUser(d.user); }
  catch { signedOut(); }
}
function setTab(next) {
  tab = next;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $("#usernameField").classList.toggle("hidden", tab !== "register");
  $("#authSubmit").textContent = tab === "register" ? "CREATE ACCOUNT" : "LOGIN TO ACCOUNT";
  $("#authMsg").textContent = "";
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  try {
    const d = await api(tab === "register" ? "/api/register" : "/api/login", {
      method: "POST", body: JSON.stringify(body)
    });
    showUser(d.user);
    toast("Welcome to the demo platform");
  } catch (err) { $("#authMsg").textContent = err.message; }
});
$("#logoutBtn").onclick = async () => {
  await api("/api/logout", { method: "POST" });
  signedOut();
  toast("Logged out");
};
$("#historyBtn").onclick = async () => {
  if (!currentUser) return toast("Log in to view transactions");
  try {
    const d = await api("/api/transactions");
    const lines = d.transactions.map(x =>
      `${x.created_at} | ${x.kind} | ${x.amount > 0 ? "+" : ""}${x.amount} | ${x.note}`
    );
    alert(lines.length ? lines.join("\n") : "No transactions yet");
  } catch (e) { toast(e.message); }
};
$("#playSlot").onclick = () => {
  if (!currentUser) { location.hash = "#account"; return toast("Log in to play"); }
  $("#gameModal").classList.remove("hidden");
};
$("#closeModal").onclick = () => $("#gameModal").classList.add("hidden");
$("#betDown").onclick = () => {
  bet = Math.max(1, bet - 1);
  $("#betValue").textContent = bet;
};
$("#betUp").onclick = () => {
  bet = Math.min(100, bet + 1);
  $("#betValue").textContent = bet;
};
$("#spinBtn").onclick = async () => {
  $("#spinBtn").disabled = true;
  $("#gameMsg").textContent = "Spinning…";
  try {
    const d = await api("/api/game/slot", {
      method: "POST", body: JSON.stringify({ bet })
    });
    $("#reels").textContent = d.result.join("　");
    $("#gameMsg").textContent = d.payout
      ? `You won ${d.payout} demo credits.`
      : `No win this spin. Bet: ${d.bet} demo credits.`;
    showUser({ ...currentUser, balance: d.balance });
  } catch (e) { $("#gameMsg").textContent = e.message; }
  finally { $("#spinBtn").disabled = false; }
};

$("#adminBtn").onclick = async () => {
  $("#adminPanel").classList.remove("hidden");
  $("#adminPanel").scrollIntoView({ behavior: "smooth" });
  await loadAdmin();
};
async function loadAdmin() {
  try {
    const d = await api("/api/admin/users");
    $("#adminUsers").innerHTML = "";
    d.users.forEach(u => {
      const row = document.createElement("div");
      row.className = "admin-row";
      const info = document.createElement("span");
      info.textContent = `#${u.id} ${u.username} · ${u.email} · ${u.balance} credits`;
      const btn = document.createElement("button");
      btn.textContent = "+100 demo";
      btn.onclick = async () => {
        try {
          await api("/api/admin/credits", {
            method: "POST", body: JSON.stringify({ userId: u.id, amount: 100 })
          });
          toast("100 demo credits added");
          loadAdmin();
          if (currentUser && currentUser.id === u.id) refresh();
        } catch (e) { toast(e.message); }
      };
      row.append(info, btn);
      $("#adminUsers").append(row);
    });
  } catch (e) { toast(e.message); }
}
$("#menuBtn").onclick = () => {
  const links = $(".navlinks");
  links.style.display = links.style.display === "flex" ? "none" : "flex";
  links.style.position = "absolute";
  links.style.right = "6%";
  links.style.top = "65px";
  links.style.flexDirection = "column";
  links.style.padding = "18px";
  links.style.background = "#17140e";
};
refresh();
