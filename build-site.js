// Builds the hostable site in ./site from the same sources as the claude.ai pages.
// Usage: node build-site.js
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const dir = __dirname;
execFileSync(process.execPath, [path.join(dir, "sync-tutor.js")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(dir, "build-desk.js")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(dir, "build-waypoint.js")], { stdio: "inherit" });
execFileSync(process.execPath, [path.join(dir, "build-studio.js")], { stdio: "inherit" });

const out = path.join(dir, "site");
fs.mkdirSync(out, { recursive: true });

// A real host gets no page skeleton, so add one; config.js loads first so the lab can read it.
function page(body) {
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
    '<script src="config.js"></script>\n<script src="ollama-shim.js"></script>\n</head>\n<body>\n' + body + "\n</body>\n</html>\n";
}
// Every AI feature on the local site runs on Ollama (Llama on this laptop) when it is running.
fs.copyFileSync(path.join(dir, "ollama-shim.js"), path.join(out, "ollama-shim.js"));
fs.copyFileSync(path.join(dir, "login.html"), path.join(out, "login.html"));
fs.copyFileSync(path.join(dir, "studio-blueprint.html"), path.join(out, "blueprint.html"));
fs.writeFileSync(path.join(out, "index.html"), page(fs.readFileSync(path.join(dir, "waypoint.html"), "utf8")));
fs.writeFileSync(path.join(out, "lab.html"), page(fs.readFileSync(path.join(dir, "discount-desk.html"), "utf8")));
fs.writeFileSync(path.join(out, "studio.html"), page(fs.readFileSync(path.join(dir, "studio.html"), "utf8")));
fs.writeFileSync(path.join(out, "companion.html"), page(fs.readFileSync(path.join(dir, "companion.html"), "utf8")));

const cfgPath = path.join(out, "config.js");
if (!fs.existsSync(cfgPath)) {
  fs.writeFileSync(cfgPath, `// Class resources shown inside the Discount Desk lab.
// Every entry is optional. Leave a link empty ("") and the lab uses its own built-in fallback.
window.LAB_CONFIG = {
  // Forecast step (step 2). Any Tableau Public view URL works.
  // EXAMPLE ONLY: this dashboard was made by another Tableau Public author, not for this course.
  // Replace it with the class workbook once it is published, and set tableauOverviewIsExample to false.
  // Fallback when empty: the lab's own forecast chart, built from the course dataset.
  tableauOverview: "https://public.tableau.com/views/SuperstoreDashboard_16709573699130/SuperstoreDashboard",
  tableauOverviewTitle: "Superstore dashboard",
  tableauOverviewCredit: "Example view by Priya Padham on Tableau Public",
  tableauOverviewIsExample: true,

  // Discount cap step (step 3). EXAMPLE ONLY, by another Tableau Public author.
  // Fallback when empty: the lab's own discount simulator.
  tableauSubcat: "https://public.tableau.com/views/SuperstoreSubcategoryTableProfitvsSales/Dashboard1",
  tableauSubcatTitle: "Sub-category profit vs sales",
  tableauSubcatCredit: "Example view by Trisha Maley on Tableau Public",
  tableauSubcatIsExample: true,

  // Supervise-the-agent step (step 4). Paste the class Discount Guardrail Google Sheet link,
  // shared as "Anyone with the link can view". NOT SET YET.
  // Fallback when empty: students download their own policy as a CSV to import into Google Sheets.
  guardrailSheet: "",

  // Optional link to the class Make scenario, or the Make sign-in page.
  makeScenario: "https://www.make.com/en/login"
};
`);
}
console.log("site ready:", fs.readdirSync(out).join(", "));
