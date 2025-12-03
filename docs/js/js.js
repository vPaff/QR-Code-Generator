/* app.js - cleaned + fixed */

/* ------------------ STATE ------------------ */
let qrGenerated = false;
let lastText = "";

/* ------------------ DOM ------------------ */
const qrCanvas = document.getElementById("qrCanvas");
const placeholder = document.getElementById("qrPlaceholder");
const inputLink = document.getElementById("inputLink");

const clearInputBtn = document.getElementById("clearInputBtn");

function updateClearBtn() {
  if (!clearInputBtn || !inputLink) return;
  clearInputBtn.classList.toggle("show", inputLink.value.trim().length > 0);
}

if (clearInputBtn && inputLink) {
  updateClearBtn();

  inputLink.addEventListener("input", updateClearBtn);

  clearInputBtn.addEventListener("click", () => {
    inputLink.value = "";
    updateClearBtn();
    inputLink.focus();
  });
}


/* ------------------ TOASTS ------------------ */
const toast = (() => {
  const MAX_VISIBLE = 3;
  const DEFAULT_DURATION = 2600;
  const DEDUPE_WINDOW_MS = 1200;

  let stack = null;
  const queue = [];
  const active = [];
  const meta = new WeakMap(); // el -> { key, createdAt, timerId, count }
  const keyToEl = new Map();  // key -> el (only while active)

  const ensureStack = () => {
    if (stack) return stack;
    stack = document.getElementById("toastStack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "toastStack";
      stack.className = "toast-stack";
      stack.setAttribute("aria-live", "polite");
      stack.setAttribute("aria-relevant", "additions text");
      document.body.appendChild(stack);
    }
    return stack;
  };

  const renderCount = (el, count) => {
    const msg = el.querySelector(".toast__msg");
    if (!msg) return;

    let badge = msg.querySelector(".toast__count");
    if (count <= 1) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "toast__count";
      msg.appendChild(badge);
    }
    badge.textContent = `x${count}`;
  };

  const scheduleClose = (el, duration) => {
    const info = meta.get(el);
    if (!info) return;
    if (info.timerId) clearTimeout(info.timerId);
    info.timerId = setTimeout(() => dismiss(el), duration);
    meta.set(el, info);
  };

  const createToastEl = (message, type) => {
    const el = document.createElement("div");
    el.className = `toast toast--${type || "info"}`;
    el.setAttribute("role", "status");

    const dot = document.createElement("span");
    dot.className = "toast__dot";
    dot.setAttribute("aria-hidden", "true");

    const msg = document.createElement("div");
    msg.className = "toast__msg";
    msg.textContent = String(message ?? "");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast__close";
    close.setAttribute("aria-label", "Close notification");
    close.textContent = "✕";
    close.addEventListener("click", () => dismiss(el));

    el.appendChild(dot);
    el.appendChild(msg);
    el.appendChild(close);

    return el;
  };

  const drain = () => {
    ensureStack();

    while (active.length < MAX_VISIBLE && queue.length) {
      const item = queue.shift();
      const el = createToastEl(item.message, item.type);
      const createdAt = Date.now();

      meta.set(el, {
        key: item.key,
        createdAt,
        timerId: null,
        count: 1,
        duration: item.duration
      });

      keyToEl.set(item.key, el);
      active.push(el);

      stack.appendChild(el);
      requestAnimationFrame(() => el.classList.add("show"));
      scheduleClose(el, item.duration);
    }
  };

  const removeFromActive = (el) => {
    const idx = active.indexOf(el);
    if (idx !== -1) active.splice(idx, 1);

    const info = meta.get(el);
    if (info?.key) keyToEl.delete(info.key);
  };

  const dismiss = (el) => {
    if (!el || el.dataset.removing === "1") return;
    el.dataset.removing = "1";

    const info = meta.get(el);
    if (info?.timerId) clearTimeout(info.timerId);

    el.classList.remove("show");
    el.classList.add("hide");

    const done = () => {
      el.removeEventListener("transitionend", done);
      removeFromActive(el);
      el.remove();
      drain();
    };

    el.addEventListener("transitionend", done);
    // In case transitionend doesn't fire:
    setTimeout(done, 250);
  };

  return (message, type = "info", opts = {}) => {
    const duration = Math.max(500, Number(opts.duration ?? DEFAULT_DURATION));
    const key = `${type}:${String(message ?? "").trim()}`;

    // Dedupe: if same toast is already on screen, bump counter instead of stacking forever
    const existing = keyToEl.get(key);
    if (existing) {
      const info = meta.get(existing);
      if (info && Date.now() - info.createdAt < 60_000) {
        // only dedupe reasonably recent ones
        info.count = (info.count || 1) + 1;
        renderCount(existing, info.count);

        // refresh timer if spammed quickly
        if (Date.now() - info.createdAt < DEDUPE_WINDOW_MS) {
          scheduleClose(existing, duration);
        }
        return;
      }
    }

    queue.push({ key, message, type, duration });
    drain();
  };
})();

window.toast = toast;


/* ------------------ HELPER: LABEL FROM TEXT ------------------ */
function extractLabel(text) {
  const s = String(text ?? "").trim();
  const looksLikeURL = s.includes(".") || s.includes("/") || s.startsWith("http");

  if (!looksLikeURL) return s.length > 10 ? s.substring(0, 10) + "…" : s;

  try {
    const url = new URL(s.startsWith("http") ? s : "https://" + s);
    let host = url.hostname.replace("www.", "");

    const brands = {
      "youtube.com": "YouTube",
      "youtu.be": "YouTube",
      "facebook.com": "Facebook",
      "instagram.com": "Instagram",
      "tiktok.com": "TikTok",
      "twitter.com": "Twitter",
      "github.com": "GitHub",
      "reddit.com": "Reddit",
      "discord.com": "Discord",
      "spotify.com": "Spotify",
      "openai.com": "OpenAI",
      "linkedin.com": "LinkedIn",
      "google.com": "Google",
      "chatgpt.com": "ChatGPT",
      "gmail.com": "Gmail"
    };

    if (brands[host]) return brands[host];

    const base = host.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return s.length > 12 ? s.substring(0, 12) + "…" : s;
  }
}

/* ------------------ OPTIONAL: CONTENT BLOCKLIST ------------------ */
/* Put words you want to block in this array (case doesn’t matter). */
const BLOCKED_TERMS = [
  "nigger",
  "nigga",
  "n1gger",
  "n1gga",
  "faggot",
  "kike",
  "chink",
  "childsex"
];

function normalizeForFilter(input, repeatMode = "double") {
  let s = String(input ?? "").toLowerCase();

  const map = { "0":"o","1":"i","3":"e","4":"a","5":"s","7":"t","$":"s","@":"a" };
  s = s.replace(/[013457$@]/g, ch => map[ch] || ch);

  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/[^a-z0-9]+/g, "");

  if (repeatMode === "single") s = s.replace(/(.)\1+/g, "$1");
  else s = s.replace(/(.)\1{2,}/g, "$1$1");

  return s;
}

function isBlocked(text) {
  if (!BLOCKED_TERMS?.length) return false;

  const nDouble = normalizeForFilter(text, "double");
  const nSingle = normalizeForFilter(text, "single");

  return BLOCKED_TERMS.some(term => {
    const tDouble = normalizeForFilter(term, "double");
    const tSingle = normalizeForFilter(term, "single");

    return (
      (tDouble && (nDouble.includes(tDouble) || nSingle.includes(tDouble))) ||
      (tSingle && (nDouble.includes(tSingle) || nSingle.includes(tSingle)))
    );
  });
}

/* ------------------ MODAL ------------------ */
function showModal(message) {
  // Use toast notifications instead of blocking modals
  toast(message ?? "", "error", { duration: 3200 });
}


function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  const box = document.getElementById("modalBox");
  if (!overlay || !box) return;

  overlay.style.display = "none";
  box.classList.remove("show");
  box.style.display = "none";
}

/* ------------------ CONFIRM (YES/NO) ------------------ */
let _confirmYes = null;

function showConfirm(message, onYes) {
  _confirmYes = typeof onYes === "function" ? onYes : null;

  const overlay = document.getElementById("confirmOverlay");
  const box = document.getElementById("confirmBox");
  const msg = document.getElementById("confirmMessage");
  if (!overlay || !box || !msg) return;

  msg.textContent = message || "Are you sure?";
  overlay.style.display = "block";
  box.style.display = "block";
  requestAnimationFrame(() => box.classList.add("show"));
}

function closeConfirm() {
  const overlay = document.getElementById("confirmOverlay");
  const box = document.getElementById("confirmBox");
  if (!overlay || !box) return;

  overlay.style.display = "none";
  box.classList.remove("show");
  box.style.display = "none";
  _confirmYes = null;
}

document.addEventListener("click", (e) => {
  const yes = e.target.closest("#confirmYesBtn");
  const no = e.target.closest("#confirmNoBtn");
  if (yes) {
    e.preventDefault();
    e.stopPropagation();
    const fn = _confirmYes;
    _confirmYes = null;
    try { fn?.(); } finally {}
  }
  if (no) {
    e.preventDefault();
    e.stopPropagation();
    closeConfirm();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const o = document.getElementById("confirmOverlay");
    if (o && o.style.display === "block") closeConfirm();

    const m = document.getElementById("modalBox");
    if (m && m.style.display === "block") closeModal();
  }
});

/* ------------------ QR GENERATION ------------------ */
async function generateQR() {
  const input = document.getElementById("inputLink");
  const text = (input?.value || "").trim();

  if (!text) return showModal("Please enter a value.");
  if (isBlocked(text)) return showModal("This text isn’t allowed.");

  // If the QR library failed to load (common when offline), show a clear message
  if (!window.QRCode || (typeof QRCode.toDataURL !== "function" && typeof QRCode.toCanvas !== "function")) {
    return showModal("QR engine failed to load. Check your internet connection or include qrcode.min.js locally.");
  }

  lastText = text;

  if (placeholder) placeholder.style.display = "none";
  if (qrCanvas) qrCanvas.style.display = "block";

  const box = document.querySelector(".qr-box");
  const boxSize = Math.max(180, (box?.offsetWidth || 360) - 60);

  const opts = {
    width: boxSize,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" }
  };

  const fail = (err) => {
    console.error(err);
    qrGenerated = false;
    if (qrCanvas) qrCanvas.style.display = "none";
    if (placeholder) placeholder.style.display = "flex";

    const msg = String(err?.message || err || "");
    const low = msg.toLowerCase();

    if (low.includes("too long") || low.includes("too many")) {
      showModal("Text is too long for a QR code. Please shorten it.");
    } else {
      showModal("Couldn't generate QR code. " + (msg ? msg : "Please try again."));
    }
  };

  try {
    // More reliable path: generate a dataURL first, then draw it to the canvas
    if (typeof QRCode.toDataURL === "function") {
      const url = await QRCode.toDataURL(text, opts);

      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const ctx = qrCanvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas context not available."));
          // Make sure canvas matches the rendered QR size
          qrCanvas.width = boxSize;
          qrCanvas.height = boxSize;
          ctx.clearRect(0, 0, boxSize, boxSize);
          ctx.drawImage(img, 0, 0, boxSize, boxSize);
          resolve();
        };
        img.onerror = () => reject(new Error("Failed to draw QR image."));
        img.src = url;
      });
    } else {
      // Fallback: direct-to-canvas (older builds)
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(qrCanvas, text, opts, (err) => (err ? reject(err) : resolve()));
      });
    }

    qrGenerated = true;

    // Save to history, but never let a history error break QR generation
    try {
      saveToHistory(text);
    } catch (e) {
      console.warn("History save failed:", e);
    }

    toast("QR generated.", "success");
  } catch (err) {
    fail(err);
  }
}

/* Make functions available for inline HTML onclick="..." */
window.generateQR = generateQR;
window.closeModal = closeModal;

/* ------------------ OPEN FULL QR ------------------ */
function openFullQR() {
  if (!qrGenerated) return showModal("Please generate a QR code first.");
  const dataUrl = qrCanvas.toDataURL("image/png");
  const win = window.open("", "_blank");

  win.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>Full QR Code</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    html, body { height: 100%; }
    body {
      font-family: "Inter", sans-serif;
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: #ffffff;
    }
    .qrImg {
      max-width: 100vw;
      max-height: 100vh;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      border-radius: 14px;
      cursor: pointer;
      transition: transform 0.15s ease, filter 0.15s ease, box-shadow 0.15s ease;
    }
    .qrImg:hover {
      transform: translateY(-4px);
      filter: brightness(1.03);
      box-shadow: 0 16px 26px rgba(0,0,0,0.5);
    }
    .qrImg:active { transform: scale(0.96); }
    .watermark {
      position: fixed;
      right: 20px;
      bottom: 20px;
      color: #5a5a5a;
      opacity: 0.7;
      font-size: 16px;
      pointer-events: none;
      font-family: "Inter", sans-serif;
    }
  </style>
</head>
<body>
  <img src="${dataUrl}" class="qrImg" onclick="window.close()">
  <div class="watermark">© vPaff</div>
</body>
</html>`);
  win.document.close();
}
window.openFullQR = openFullQR;

/* ------------------ PRINT ------------------ */
function printQR() {
  if (!qrGenerated) return showModal("Please generate a QR code first.");

  const dataUrl = qrCanvas.toDataURL("image/png");
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    return showModal("Popup blocked. Please allow popups to print.");
  }

  printWindow.document.open();
  printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
  <title>Print QR Code</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
  <style>
    @page { margin: 0; }
    html, body { height: 100%; }
    body {
      font-family: "Inter", sans-serif;
      margin: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background: white;
    }
    img {
      width: 12cm;
      height: 12cm;
      border-radius: 14px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
    }
    .watermark {
      position: fixed;
      right: 20px;
      bottom: 20px;
      color: #5a5a5a;
      opacity: 0.7;
      font-size: 16px;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <img src="${dataUrl}">
  <div class="watermark">© vPaff</div>

  <script>
    // Print AFTER the window is fully loaded, then close AFTER printing.
    window.addEventListener('load', () => {
      window.focus();
      setTimeout(() => window.print(), 80);
    });

    window.addEventListener('afterprint', () => {
      setTimeout(() => window.close(), 80);
    });
  </script>
</body>
</html>
  `);
  printWindow.document.close();

  // When you come back to the app, force focus back to the input
  window.addEventListener(
    "focus",
    () => {
      if (typeof inputLink !== "undefined" && inputLink) {
        inputLink.disabled = false;
        inputLink.readOnly = false;
        inputLink.focus({ preventScroll: true });
      }
    },
    { once: true }
  );
}

window.printQR = printQR;

/* ------------------ ENTER KEY HANDLING ------------------ */
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;

  const modal = document.getElementById("modalBox");
  if (modal && modal.style.display === "block") {
    event.preventDefault();
    closeModal();
    return;
  }

  if (document.activeElement === inputLink) {
    event.preventDefault();
    generateQR();
  }
});

/* ------------------ SIDE HISTORY TOGGLE (desktop open by default, mobile collapsible) ------------------ */
(() => {
  const wrap = document.querySelector(".side-history");
  const small = document.getElementById("historySmall");
  const fullBtn = document.getElementById("fullHistoryBtn");

  // The clickable History button (has onclick in HTML)
  const historyBtn = document.querySelector(".history-btn.dropdown-btn");

  if (!wrap || !small || !fullBtn || !historyBtn) return;

  // Remove the HTML `hidden` attribute so CSS can control visibility
  small.hidden = false;
  fullBtn.hidden = false;

const mq = window.matchMedia("(max-width: 860px)");

// Closed by default everywhere
wrap.classList.remove("is-open");

// On resize/orientation: don't force close/open—keep whatever the user chose
const handleViewportChange = () => {
  // do nothing on purpose
};

if (mq.addEventListener) mq.addEventListener("change", handleViewportChange);
else mq.addListener(handleViewportChange);


  // Used by HTML: onclick="toggleHistoryDropdown(event)"
  function toggleHistoryDropdown(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    wrap.classList.toggle("is-open");
  }

  window.toggleHistoryDropdown = toggleHistoryDropdown;
})();


/* ------------------ FULL HISTORY MODAL ------------------ */
// DVD-style bounce for the empty message inside the Full History grid (only when modal is open)
let dvdBounce = null;

function stopDvdBounce() {
  if (dvdBounce?.raf) cancelAnimationFrame(dvdBounce.raf);
  dvdBounce = null;
}

function kickDvdBounce() {
  // Restart from scratch (safe to call often)
  stopDvdBounce();

  const overlay = document.getElementById("fullHistoryOverlay");
  const container = document.getElementById("fullHistoryGrid");
  const el = document.getElementById("fullHistoryEmpty") || container?.querySelector(".dvd-bounce");

  if (!overlay || !container || !el) return;
  if (!container.classList.contains("is-empty")) return;

  // Only run while the modal is visible
  if (overlay.style.display === "none") return;

  // Wait one frame so sizes are correct
  requestAnimationFrame(() => {
    if (overlay.style.display === "none") return;
    if (!container.isConnected || !el.isConnected) return;
    if (!container.classList.contains("is-empty")) return;

    let x = Math.random() * 24;
    let y = Math.random() * 24;

    // Pixels per second (tweak for faster/slower)
    let vx = 140;
    let vy = 110;

    let last = null;

    dvdBounce = { raf: 0 };

    const step = (ts) => {
      if (!dvdBounce) return;

      if (overlay.style.display === "none" || !container.classList.contains("is-empty") || !el.isConnected) {
        stopDvdBounce();
        return;
      }

      if (last == null) last = ts;
      const dt = Math.min(0.05, (ts - last) / 1000); // clamp big jumps
      last = ts;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const ew = el.offsetWidth;
      const eh = el.offsetHeight;

      // If layout isn't ready yet, keep trying
      if (!cw || !ch || !ew || !eh) {
        dvdBounce.raf = requestAnimationFrame(step);
        return;
      }

      x += vx * dt;
      y += vy * dt;

      // Bounce off edges
      if (x <= 0) { x = 0; vx = Math.abs(vx); }
      else if (x + ew >= cw) { x = Math.max(0, cw - ew); vx = -Math.abs(vx); }

      if (y <= 0) { y = 0; vy = Math.abs(vy); }
      else if (y + eh >= ch) { y = Math.max(0, ch - eh); vy = -Math.abs(vy); }

      el.style.transform = `translate(${x}px, ${y}px)`;

      dvdBounce.raf = requestAnimationFrame(step);
    };

    dvdBounce.raf = requestAnimationFrame(step);
  });
}

function openFullHistory() {
  const o = document.getElementById("fullHistoryOverlay");
  if (o) o.style.display = "flex";

  // Start the bounce only if the full grid is currently empty
  requestAnimationFrame(() => requestAnimationFrame(kickDvdBounce));
}

function closeFullHistory() {
  const o = document.getElementById("fullHistoryOverlay");
  if (o) o.style.display = "none";
  stopDvdBounce();
}

window.openFullHistory = openFullHistory;
window.closeFullHistory = closeFullHistory;

// If user rotates/resizes while empty modal is open, restart so bounds are correct
window.addEventListener("resize", () => {
  const overlay = document.getElementById("fullHistoryOverlay");
  const container = document.getElementById("fullHistoryGrid");
  if (overlay?.style.display !== "none" && container?.classList.contains("is-empty")) kickDvdBounce();
});
;
window.closeFullHistory = closeFullHistory;

/* ------------------ HISTORY (LOCALSTORAGE) ------------------ */
const THUMB_SIZE = 96;
const thumbCache = new Map();

function makeThumb(text) {
  const key = String(text);
  if (thumbCache.has(key)) return Promise.resolve(thumbCache.get(key));

  return new Promise((resolve) => {
    try {
      QRCode.toDataURL(
        text,
        { width: THUMB_SIZE, margin: 1 },
        (err, url) => {
          if (err) {
            console.warn("Thumb failed:", err);
            thumbCache.set(key, "");
            resolve("");
            return;
          }
          thumbCache.set(key, url);
          resolve(url);
        }
      );
    } catch (e) {
      console.warn("Thumb failed:", e);
      thumbCache.set(key, "");
      resolve("");
    }
  });
}

function getHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem("qrHistory") || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function setHistory(history) {
  localStorage.setItem("qrHistory", JSON.stringify(history));
}

function ensureHistoryIds(history) {
  let changed = false;

  const out = history
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      if (!it.id) {
        changed = true;
        return { ...it, id: crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}` };
      }
      return it;
    })
    .filter(Boolean);

  if (changed) setHistory(out);
  return out;
}

function saveToHistory(text) {
  if (isBlocked(text)) return;

  const history = ensureHistoryIds(getHistory());
  history.unshift({
    id: crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    text,
    label: extractLabel(text),
    time: Date.now()
  });

  if (history.length > 25) history.length = 25;
  setHistory(history);
  loadHistory();
}

function deleteHistoryItem(id) {
  if (!id) return;
  const history = getHistory().filter((it) => it.id !== id);
  setHistory(history);
  loadHistory();
  toast("History item deleted.", "info");
}

function clearAllHistory() {
  setHistory([]);
  loadHistory();
  toast("Full history cleared.", "info");
}

function clampText(str, maxChars) {
  const s = String(str ?? "");
  return s.length > maxChars ? s.slice(0, maxChars) + "…" : s;
}

function historyMaxChars() {
  return window.matchMedia("(max-width: 860px)").matches ? 8 : 12;
}

async function loadHistory() {
  const small = document.getElementById("historySmall");
  const full = document.getElementById("fullHistoryGrid");
  const clearBtn = document.getElementById("clearFullHistoryBtn");
  if (!small || !full) return;

  small.innerHTML = "";
  full.innerHTML = "";

  // If the empty message was bouncing, stop it before re-rendering
  if (typeof stopDvdBounce === "function") stopDvdBounce();

  let history = ensureHistoryIds(getHistory());

  // Remove blocked items if list changed
  const before = history.length;
  history = history.filter((item) => !isBlocked(item.text));
  if (history.length !== before) setHistory(history);

  if (clearBtn) clearBtn.style.display = history.length ? "inline-flex" : "none";

  const isEmpty = history.length === 0;

  // Empty-state labels
  small.classList.toggle("is-empty", isEmpty);
  full.classList.toggle("is-empty", isEmpty);

  if (isEmpty) {
    const msgSmall = document.createElement("div");
    msgSmall.className = "history-empty";
    msgSmall.innerHTML = `No history yet.<br><span class="history-empty-sub">Generate a QR to see it here.</span>`;
    small.appendChild(msgSmall);

    const msgFull = document.createElement("div");
    msgFull.id = "fullHistoryEmpty";
    msgFull.className = "history-empty dvd-bounce";
    msgFull.innerHTML = `No history yet.<br><span class="history-empty-sub">Generate a QR to see it here.</span>`;
    full.appendChild(msgFull);

    // Start DVD bounce only when the modal is open
    kickDvdBounce();
    return;
  }


  // Sidebar: last 3
  for (const item of history.slice(0, 3)) {
    const thumbUrl = await makeThumb(item.text);

    const container = document.createElement("div");
    container.className = "history-item";

    const thumb = document.createElement("div");
    thumb.className = "history-thumb";

    if (thumbUrl) thumb.innerHTML = `<img src="${thumbUrl}" alt="">`;
    else thumb.innerHTML = `<div class="thumb-fallback">Too long</div>`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "hist-del";
    del.setAttribute("aria-label", "Delete history item");
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteHistoryItem(item.id);
    });

    thumb.appendChild(del);

    const label = document.createElement("div");
    label.className = "history-label";
    label.textContent = clampText(item.label || extractLabel(item.text), historyMaxChars());

    container.appendChild(thumb);
    container.appendChild(label);

    container.addEventListener("click", () => {
      document.getElementById("inputLink").value = item.text;
      generateQR();
    });

    small.appendChild(container);
  }

  // Full History: up to 25
  for (const item of history.slice(0, 25)) {
    const thumbUrl = await makeThumb(item.text);

    const box = document.createElement("div");
    box.className = "full-history-item";

    const img = document.createElement("img");
    img.alt = "";
    if (thumbUrl) img.src = thumbUrl;

    const label = document.createElement("div");
    label.className = "history-label";
    label.textContent = clampText(item.label || extractLabel(item.text), historyMaxChars());

    const del = document.createElement("button");
    del.type = "button";
    del.className = "hist-del";
    del.setAttribute("aria-label", "Delete history item");
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteHistoryItem(item.id);
    });

    box.appendChild(img);
    box.appendChild(label);
    box.appendChild(del);

    box.addEventListener("click", () => {
      document.getElementById("inputLink").value = item.text;
      generateQR();
      closeFullHistory();
    });

    full.appendChild(box);
  }
}
window.loadHistory = loadHistory;

function confirmClearFullHistory(e) {
  e?.stopPropagation?.();
  const history = getHistory();
  if (!history.length) { toast("History is already empty.", "warn"); return; }

  showConfirm("Are you sure you want to delete the full history?", () => {
    clearAllHistory();
    closeConfirm();
  });
}
window.confirmClearFullHistory = confirmClearFullHistory;

/* Refresh labels on resize */
let _histResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(_histResizeTimer);
  _histResizeTimer = setTimeout(loadHistory, 120);
});

/* ------------------ EXTENSION DROPDOWN (.com etc.) ------------------ */
(() => {
  const input = document.getElementById("inputLink");
  const dropdown = document.querySelector(".ext-dropdown");
  const menu = document.getElementById("extMenu");
  const main = document.getElementById("extMain");
  const arrow = document.getElementById("extArrow");

  const exts = [".com", ".gr", ".net", ".org", ".io", ".app"];
  if (!input || !dropdown || !menu || !main || !arrow) return;

  main.addEventListener("click", () => {
    const ext = main.textContent.trim();
    const value = (input.value || "").trim();
    if (!value) return;

    const re = new RegExp(`(${exts.map(e => e.replace(".", "\\.")).join("|")})$`);
    const base = value.replace(re, "");
    input.value = base + ext;

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  arrow.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
  });

  menu.addEventListener("click", (e) => {
    const item = e.target.closest(".ext-item");
    if (!item) return;

    const ext = item.dataset.ext;
    main.textContent = ext;

    const value = (input.value || "").trim();
    if (value) {
      const re = new RegExp(`(${exts.map(e => e.replace(".", "\\.")).join("|")})$`);
      const base = value.replace(re, "");
      input.value = base + ext;
    }

    dropdown.classList.remove("open");
  });

  document.addEventListener("click", () => dropdown.classList.remove("open"));
})();

/* ------------------ SAVE AS SPLIT BUTTON ------------------ */
(() => {
  const split = document.querySelector(".save-split-btn");
  const saveMainBtn = document.getElementById("saveMainBtn");
  const saveArrowBtn = document.getElementById("saveArrowBtn");
  const saveFormatMenu = document.getElementById("saveFormatMenu");
  if (!split || !saveMainBtn || !saveArrowBtn || !saveFormatMenu) return;

  let currentFormat = "png";

  const safeFileBase = () => {
    const base = lastText ? extractLabel(lastText) : "QR";
    return String(base)
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40) || "QR";
  };

  const downloadDataUrl = (dataUrl, filename) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    const ext = (String(filename || "").split(".").pop() || "").toUpperCase();
    toast(`Saved as ${ext || "FILE"}.`, "success");
  };

  const closeMenu = () => split.classList.remove("open");
  const toggleMenu = () => split.classList.toggle("open");

  saveArrowBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  saveFormatMenu.addEventListener("click", (e) => {
    e.stopPropagation();
    const btn = e.target.closest(".save-format-item");
    if (!btn) return;

    currentFormat = (btn.dataset.format || "png").toLowerCase();
    saveArrowBtn.textContent = currentFormat.toUpperCase() + " ▾";
    closeMenu();
  });

  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  function saveAsPNG() {
    downloadDataUrl(qrCanvas.toDataURL("image/png"), `${safeFileBase()}_qrcode.png`);
  }

  function saveAsJPG() {
    downloadDataUrl(qrCanvas.toDataURL("image/jpeg", 0.95), `${safeFileBase()}_qrcode.jpg`);
  }

  function savePDF() {
    const jsPDF = window.jspdf?.jsPDF;
    if (!jsPDF) return showModal("PDF library not loaded.");

    const pdf = new jsPDF();
    const imgData = qrCanvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 20, 20, 170, 170);
    pdf.save(`${safeFileBase()}_qrcode.pdf`);
    toast("Saved as PDF.", "success");
  }

  saveMainBtn.addEventListener("click", () => {
    if (!qrGenerated) return showModal("Please generate a QR code first.");

    if (currentFormat === "png") saveAsPNG();
    else if (currentFormat === "jpg") saveAsJPG();
    else if (currentFormat === "pdf") savePDF();
  });
})();

/* ------------------ INIT ------------------ */
document.addEventListener("DOMContentLoaded", () => {
  // Collapse side history at start
  const small = document.getElementById("historySmall");
  const btn = document.getElementById("fullHistoryBtn");
  if (small) small.style.display = "none";
  if (btn) btn.style.display = "none";

  // Load saved history immediately
  loadHistory();
});
