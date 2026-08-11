const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "node_modules", "@coderline", "alphatab", "dist");
const dst = path.join(__dirname, "public", "alphatab");

const dirs = ["font", "soundfont"];
dirs.forEach((d) => fs.mkdirSync(path.join(dst, d), { recursive: true }));

// Copy font files (skip if already exist)
const fontSrc = path.join(src, "font");
fs.readdirSync(fontSrc).forEach((f) => {
  const target = path.join(dst, "font", f);
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(fontSrc, f), target);
});

// Copy soundfont files (skip if already exist)
const sfSrc = path.join(src, "soundfont");
fs.readdirSync(sfSrc).forEach((f) => {
  const target = path.join(dst, "soundfont", f);
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(sfSrc, f), target);
});

// Always copy core alphaTab files
["alphaTab.mjs", "alphaTab.core.mjs"].forEach((f) => {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
});

console.log("alphaTab assets copied to public/alphatab/");
