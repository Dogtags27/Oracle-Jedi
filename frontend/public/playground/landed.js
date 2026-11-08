const SCENES = {
  "popads.example": { scene: "prize", via: "the ✕ on the ad", expected: "closing the ad" },
  "offers.example": { scene: "sub", via: "“No thanks”", expected: "dismissing the prompt" },
  "dl-ads.example": { scene: "inst", via: "the big “Download HD” button", expected: "downloading the movie" },
  "fast-dl.example": { scene: "inst", via: "“Fast Download”", expected: "downloading the movie" },
  "clickjack.example": { scene: "alert", via: "the video player", expected: "playing the video" },
  "collect.example": { scene: "shared", via: "“Cancel” under the sign-up box", expected: "cancelling" },
  "ads.example": { scene: "ad", via: "the real “Download” link", expected: "only downloading the file", popup: true },
  "pop.example": { scene: "ad", via: "plain text on the page", expected: "nothing at all", popup: true },
};

let target = null;
try {
  const raw = new URLSearchParams(location.search).get("u") || "";
  const u = new URL(raw);
  if (/^https?:$/.test(u.protocol) && u.hostname.endsWith(".example")) target = u;
} catch {
  target = null;
}

const host = target ? target.hostname : "unknown.example";
const site = host.split(".").slice(-2).join(".");
const info = SCENES[site] || { scene: "ad", via: "a button", expected: "staying on the page", popup: false };

const addr = document.getElementById("addr");
const sub = host.slice(0, host.length - site.length);
const rest = target ? `${target.pathname}${target.search}` : "/";
addr.replaceChildren(document.createTextNode(`http://${sub}`), Object.assign(document.createElement("b"), { textContent: site }), document.createTextNode(rest));

const what = document.getElementById("what");
const strong = (t) => Object.assign(document.createElement("b"), { textContent: t });
what.replaceChildren(
  document.createTextNode(`${info.popup ? "A new tab opened when you clicked" : "You clicked"} ${info.via} on flickpond. Instead of ${info.expected}, it took you to `),
  strong(site),
  document.createTextNode(". With Avaran's Click Guard on, this click is stopped before it leaves the page."),
);

document.getElementById(`scene-${info.scene}`).hidden = false;
document.title = `${site} · where that click went`;
if (info.popup) document.getElementById("ad-eyebrow").textContent = "This tab opened by itself";

if (info.scene === "shared") {
  let email = "";
  try {
    email = sessionStorage.getItem("flickpond-email") || "";
  } catch {
    email = "";
  }
  if (email) document.getElementById("email").textContent = email;
}

for (const b of document.querySelectorAll("[data-step]")) {
  b.addEventListener("click", () => {
    const note = b.closest(".scene").querySelector(".demo-note");
    if (note) note.hidden = false;
  });
}

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
for (const t of document.querySelectorAll("[data-timer]")) {
  let left = Number(t.dataset.timer);
  t.textContent = fmt(left);
  setInterval(() => {
    left = left > 0 ? left - 1 : Number(t.dataset.timer);
    t.textContent = fmt(left);
  }, 1000);
}
