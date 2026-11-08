# Click Guard eval (deceptive buttons and links)

Run 2026-11-08T11:53:14.936Z in Chrome with the real extension, on test pages with fictional sites.

| Metric | Result |
|---|---|
| Deceptive controls flagged before any click | **6/6** |
| Normal controls wrongly flagged | **0/6** |
| Deceptive actions stopped at click time | 7/7 (fake ✕, scripted redirect, pop-under, click-anywhere pop-up, form “Cancel”, notification trap, late-injected cookie-banner ✕) |
| Normal actions allowed without a warning | 5/5 (Cancel, same-page Close, partner link, sign-in pop-up, real form submit) |
| Invisible overlays (link + frame) defused | 2/2 |
| Warned before the click, from pointer distance alone | fake ✕ at 22 px, invisible overlay on hover; 0 warnings on a normal control |
| Network requests made by Click Guard | **0** |
