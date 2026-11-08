const $ = (sel) => document.querySelector(sel);
const LANDING = new URL("landed.html", location.href);

const trapHost = (u) => {
  try {
    const host = new URL(u, location.href).hostname;
    return host.endsWith(".example") ? host : "";
  } catch {
    return "";
  }
};

const landing = (u) => {
  const url = new URL(LANDING);
  url.searchParams.set("u", String(u).slice(0, 300));
  return url.href;
};

const stash = (email) => {
  try {
    if (typeof email === "string" && email.trim()) sessionStorage.setItem("flickpond-email", email.trim().slice(0, 80));
  } catch {
    return;
  }
};

document.addEventListener("click", (e) => {
  if (e.defaultPrevented) return;
  const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!a || !trapHost(a.href)) return;
  e.preventDefault();
  if (a.target === "_blank") window.open(landing(a.href), "_blank");
  else location.assign(landing(a.href));
});

if (window.navigation) {
  window.navigation.addEventListener("navigate", (e) => {
    if (e.defaultPrevented || !e.cancelable || e.hashChange || typeof e.downloadRequest === "string") return;
    const u = e.destination.url;
    if (!trapHost(u)) return;
    e.preventDefault();
    if (e.formData) stash(e.formData.get("email"));
    setTimeout(() => location.assign(landing(u)), 0);
  });
}

document.addEventListener("securitypolicyviolation", (e) => {
  if (/^form-action/.test(e.violatedDirective) && trapHost(e.blockedURI)) location.assign(landing(e.blockedURI));
});

document.addEventListener("submit", (e) => {
  if (e.defaultPrevented) return;
  const form = e.target;
  const action = (e.submitter && e.submitter.getAttribute("formaction")) || form.getAttribute("action") || "";
  if (trapHost(action)) {
    e.preventDefault();
    stash(new FormData(form).get("email"));
    location.assign(landing(new URL(action, location.href).href));
    return;
  }
  e.preventDefault();
  if (form.id === "unlock") {
    const done = $("#unlock-done");
    done.hidden = false;
    done.textContent = "Check your inbox to finish signing up.";
  }
});

$("#no-thanks").addEventListener("click", () => {
  location.href = $("#no-thanks").dataset.url;
});

$("#real-dl").addEventListener("click", () => {
  $("#dl-state").textContent = " Download started.";
  window.open("https://ads.example/pop?src=flickpond", "_blank");
});

const realOpen = window.open;
window.open = function (url, target, features) {
  const w = realOpen.call(window, url, target, features);
  if (w && trapHost(url)) {
    try {
      w.location.replace(landing(url));
    } catch {
      return w;
    }
  }
  return w;
};

let popped = false;
document.addEventListener("click", (e) => {
  if (popped || !e.isTrusted) return;
  const t = e.target;
  if (!(t instanceof Element) || !t.closest("main, aside")) return;
  if (t.closest("a, button, input, textarea, select, label, summary, details, form, .player, .appbar, .dl, .robot")) return;
  popped = true;
  window.open("https://pop.example/x?src=flickpond", "_blank");
});

$("#play").addEventListener("click", () => {
  $("#player").classList.add("playing");
});

$("#servers").addEventListener("click", (e) => {
  const b = e.target instanceof Element ? e.target.closest("button") : null;
  if (!b) return;
  for (const x of $("#servers").querySelectorAll("button")) x.classList.toggle("on", x === b);
});

$("#request").addEventListener("click", () => {
  $("#request").textContent = "Request sent";
});

const SPAM = [
  ["Security alert", "3 threats found on this device. Tap to clean now."],
  ["You have won", "A $1,000 gift card is waiting. Claim within 10 minutes."],
  ["flickpond", "New: watch 200 movies free tonight. Tap to start."],
];

function spam() {
  const notes = $("#notes");
  SPAM.forEach(([title, body], i) => {
    setTimeout(() => {
      const n = document.createElement("div");
      n.className = "note";
      const b = document.createElement("b");
      b.textContent = title;
      const p = document.createElement("div");
      p.textContent = body;
      const s = document.createElement("small");
      s.textContent = "Simulated: what this site can now push to your desktop, even after you close the tab.";
      n.append(b, p, s);
      notes.append(n);
    }, 700 + i * 1100);
  });
}

$("#allow").addEventListener("click", async () => {
  let result = "default";
  try {
    result = await Notification.requestPermission();
  } catch {
    result = "default";
  }
  $("#perm").textContent = result === "granted" ? "Verified. Notifications are now on for this site." : result === "denied" ? "Verification failed. Try again." : "Still waiting for you to click Allow.";
  if (result === "granted") spam();
});

const ad = $("#ad");
const skip = $("#skip");
let countdown = 0;

function showAd() {
  clearInterval(countdown);
  ad.hidden = false;
  let left = 3;
  skip.disabled = true;
  skip.textContent = `Skip ad in ${left}`;
  countdown = setInterval(() => {
    left -= 1;
    if (left > 0) {
      skip.textContent = `Skip ad in ${left}`;
      return;
    }
    clearInterval(countdown);
    skip.disabled = false;
    skip.textContent = "Skip ad ›";
  }, 1000);
}

skip.addEventListener("click", () => {
  ad.hidden = true;
});

$("#replay-ad").addEventListener("click", () => {
  $("#pn").open = false;
  showAd();
});

if (!new URLSearchParams(location.search).has("noad")) setTimeout(showAd, 1200);
