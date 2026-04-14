// Change this for production — Using Vercel's relative /api path
const API_BASE = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? (window.location.port === "3000" ? "/api" : "http://localhost:8000")
  : "/api";

// ── STATE ─────────────────────────────────────────────────────────────────────
let conversationHistory = [];
let currentMetrics = null;
let isLoading = false;

// ── GRADE COLORS ──────────────────────────────────────────────────────────────
const GRADE_COLORS = { A: "#22c55e", B: "#84cc16", C: "#f59e0b", D: "#f97316", F: "#ef4444" };
const GRADE_DESCS = {
  A: "Excellent! Keep it up.",
  B: "Good work — push for the top!",
  C: "Average — let's improve together.",
  D: "Needs improvement — don't give up!",
  F: "Critical — time to act now.",
};

// ── PREDICT GRADE ──────────────────────────────────────────────────────────────
async function predictGrade() {
  const metrics = getMetrics();
  const btn = document.querySelector(".predict-btn");
  btn.textContent = "⏳ Predicting…";
  btn.disabled = true;

  console.log(`Attempting prediction at: ${API_BASE}/predict-grade`);

  try {
    const resp = await fetch(`${API_BASE}/predict-grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metrics),
    });

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ detail: "Unknown server error" }));
      throw new Error(errorData.detail || "API error");
    }
    const data = await resp.json();
    currentMetrics = metrics;
    showGrade(data.grade, data.method);
    addBotMessage(`I've predicted your grade as **${data.grade}** based on your metrics! Feel free to ask me anything — like if you're weak in a specific subject, I'll pull up notes and study techniques for you. 📚`);
  } catch (e) {
    console.error("Prediction error:", e);
    showGrade("?", "error");
    
    let errorMsg = "The ML Model could not be reached or failed to load. Please ensure the backend and model are fully operational.";
    if (e.message.includes("Failed to fetch")) {
      errorMsg = "⚠️ **Connection Error**: I couldn't reach your backend at " + API_BASE + ". Please make sure your Render service is active and not sleeping.";
    } else if (e.message.includes("ML Model has not been trained")) {
      errorMsg = "⚠️ **Model Error**: The backend is running, but the ML model file is missing or failed to load.";
    }
    
    addBotMessage(`There was an error predicting your grade: ${errorMsg}`);
  } finally {
    btn.textContent = "⚡ Predict My Grade";
    btn.disabled = false;
  }
}

function showGrade(grade, method) {
  const card = document.getElementById("grade-card");
  const letter = document.getElementById("grade-letter");
  const methodEl = document.getElementById("grade-method");
  const desc = document.getElementById("grade-desc");

  letter.textContent = grade;
  letter.style.color = GRADE_COLORS[grade] || "#fff";
  methodEl.textContent = method === "ml_model" ? "ML model" : "Rule-based estimate";
  desc.textContent = GRADE_DESCS[grade] || "";
  card.classList.add("visible");
}

// ── SEND MESSAGE ───────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || isLoading) return;

  input.value = "";
  autoResize(input);
  hideEmptyState();
  addUserMessage(text);
  showTyping();

  conversationHistory.push({ role: "user", content: text });
  isLoading = true;

  try {
    const body = {
      message: text,
      conversation_history: conversationHistory.slice(-10),
      metrics: currentMetrics || null,
    };

    const resp = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) throw new Error("API error");
    const data = await resp.json();

    removeTyping();
    conversationHistory.push({ role: "assistant", content: data.reply });

    if (data.grade_info && !currentMetrics) {
      currentMetrics = body.metrics;
      showGrade(data.grade_info.grade, data.grade_info.method);
    }

    addBotMessage(data.reply, data.search_results || []);
  } catch (e) {
    removeTyping();
    // Graceful fallback using Claude API directly from the browser
    await callClaudeFallback(text);
  } finally {
    isLoading = false;
  }
}

async function callClaudeFallback(text) {
  // NOTE: In production, NEVER expose your API key client-side.
  // This fallback is for demo purposes. Use your backend in production.
  const ANTHROPIC_API_KEY = ""; // Leave empty — handled by backend
  if (!ANTHROPIC_API_KEY) {
    addBotMessage("⚠️ I couldn't reach the backend server. Please make sure your FastAPI server is running on port 8000. Check the README for setup instructions.");
    return;
  }
}

// ── QUICK PROMPT ───────────────────────────────────────────────────────────────
function sendQuick(text) {
  document.getElementById("chat-input").value = text;
  sendMessage();
}

// ── DOM HELPERS ───────────────────────────────────────────────────────────────
function getMetrics() {
  return {
    weekly_study_hours: parseFloat(document.getElementById("s-hours").value),
    attendance_percentage: parseFloat(document.getElementById("s-att").value),
    class_participation: parseFloat(document.getElementById("s-part").value),
    total_score: parseFloat(document.getElementById("s-score").value),
  };
}

function hideEmptyState() {
  const e = document.getElementById("empty-state");
  if (e) e.remove();
}

function addUserMessage(text) {
  const msgs = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "msg user";
  div.innerHTML = `
    <div class="avatar usr">You</div>
    <div class="bubble">${escapeHtml(text)}</div>`;
  msgs.appendChild(div);
  scrollBottom();
}

function addBotMessage(text, sources = []) {
  const msgs = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "msg";

  const formatted = formatMarkdown(text);
  let sourcesHtml = "";
  if (sources.length > 0) {
    sourcesHtml = `<div class="sources">
      ${sources.map(s => `<a class="source-chip" href="${s.link}" target="_blank" rel="noopener" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</a>`).join("")}
    </div>`;
  }

  div.innerHTML = `
    <div class="avatar bot">🤖</div>
    <div class="bubble">${formatted}${sourcesHtml}</div>`;
  msgs.appendChild(div);

  // INLINE DESMOS INJECTION
  const targets = div.querySelectorAll(".inline-graph-target");
  targets.forEach((el, index) => {
    const expr = el.getAttribute("data-expr");
    el.className = "inline-graph";
    el.id = "inline-graph-" + Date.now() + "-" + index;
    const calc = Desmos.GraphingCalculator(el, { expressions: false, settingsMenu: false, zoomButtons: true });
    calc.setExpression({ id: 'graph1', latex: expr });
  });

  scrollBottom();
}

let masterCalc = null;
function openGraphModal() {
  document.getElementById("graph-backdrop").style.display = "grid";
  if (!masterCalc) {
    masterCalc = Desmos.GraphingCalculator(document.getElementById("master-calculator"));
  }
}

function closeGraphModal() {
  document.getElementById("graph-backdrop").style.display = "none";
}


function showTyping() {
  const msgs = document.getElementById("messages");
  const div = document.createElement("div");
  div.className = "msg";
  div.id = "typing-indicator";
  div.innerHTML = `
    <div class="avatar bot">🤖</div>
    <div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(div);
  scrollBottom();
}

function removeTyping() {
  const t = document.getElementById("typing-indicator");
  if (t) t.remove();
}

function scrollBottom() {
  const msgs = document.getElementById("messages");
  msgs.scrollTop = msgs.scrollHeight;
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" style="color: var(--accent); text-decoration: underline;">$1</a>')
    .replace(/\[GRAPH:\s*(.*?)\]/gi, `<div class="inline-graph-target" data-expr="$1"></div>`)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<strong>$1</strong>")
    .replace(/^## (.+)$/gm, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

// ── SERVER HEALTH CHECK ────────────────────────────────────────────────────────
let healthCheckInterval = null;

async function checkServerStatus() {
  const dot = document.querySelector(".status-dot");
  if (!dot) return;

  try {
    const start = Date.now();
    const resp = await fetch(`${API_BASE}/health`, { method: "GET", signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;

    if (resp.ok) {
      dot.style.background = "var(--grade-a)";
      dot.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, .2)";
      dot.title = `Online (${latency}ms)`;
    } else {
      throw new Error("Offline");
    }
  } catch (e) {
    dot.style.background = "var(--grade-f)";
    dot.style.boxShadow = "0 0 0 3px rgba(239, 68, 68, .2)";
    dot.title = "Offline - Check your backend server";
    console.warn("Backend unreachable:", API_BASE);
  }
}

// ── MOBILE SIDEBAR TOGGLE ───────────────────────────────────────────────────
function toggleSidebar(show) {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!sidebar || !overlay) return;
  
  if (show) {
    sidebar.classList.add("active");
    overlay.classList.add("active");
    document.body.style.overflow = "hidden"; 
  } else {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
    document.body.style.overflow = "auto";
  }
}

// ── WELCOME MESSAGE ────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  // Start health check
  checkServerStatus();
  healthCheckInterval = setInterval(checkServerStatus, 15000);

  setTimeout(() => {
    addBotMessage("👋 Hi there! I'm StudyBot. **Set your metrics** on the left panel and click **Predict My Grade** to get started. Then ask me anything — like:\n\n- *I'm weak in Mathematics*\n- *Give me Physics notes*\n- *How can I study better?*\n\nI'll fetch the best resources and guide you step by step! 🚀");
  }, 400);
});
