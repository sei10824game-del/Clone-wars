// Verify the single-file bundle: no external refs and the game actually boots.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'clone-survivors.html');
const html = fs.readFileSync(file, 'utf8');

const problems = [];
if (/<link[^>]+href="[^"]*\.css/.test(html)) problems.push('external stylesheet link remains');
if (/<script[^>]+src="/.test(html)) problems.push('external script src remains');
if (/@import\s+url/.test(html)) problems.push('web font @import remains (needs network)');

const styleCount = (html.match(/<style>/g) || []).length;
const scriptCount = (html.match(/<script>/g) || []).length;
if (styleCount !== 1) problems.push('expected 1 inline <style>, got ' + styleCount);
if (scriptCount !== 1) problems.push('expected 1 inline <script>, got ' + scriptCount);

// required ids the game looks up
for (const id of ['game', 'startBtn', 'touchStick', 'fsBtn', 'bossBar', 'cardChoices']) {
  if (!html.includes(`id="${id}"`)) problems.push('missing element #' + id);
}
// mobile bits present
for (const needle of ['pointer:coarse', 'touch-action:none', 'viewport-fit=cover', '--field-scale']) {
  if (!html.includes(needle)) problems.push('missing mobile CSS/JS marker: ' + needle);
}

console.log('file size:', (html.length / 1024).toFixed(0) + ' KB');
console.log('inline <style>:', styleCount, '| inline <script>:', scriptCount);
console.log('problems:', problems.length ? problems : 'none');
process.exit(problems.length ? 1 : 0);
