#!/usr/bin/env node
/**
 * Seravavatar Hub Auto-Watcher
 * Watches src/ files, auto-rebuilds + restarts Next.js on save
 * Run with: node watch.js
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = '/var/www/seravavatar-hub/public_html';
const BUILD_LOG = '/var/www/seravavatar-hub/logs/next-watch.log';
const PORT = 3000;

let building = false;
let buildTimer = null;

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function run(cmd, cb) {
  exec(cmd, { cwd: ROOT }, (err, stdout, stderr) => {
    if (err) log('ERROR: ' + err.message);
    if (cb) cb(err, stdout, stderr);
  });
}

function killServer(cb) {
  run(`sudo fuser -k ${PORT}/tcp 2>/dev/null; sleep 1`, () => {
    if (cb) cb();
  });
}

function build() {
  if (building) return;
  building = true;
  log('🔄 File changed — rebuilding...');

  killServer(() => {
    run('npm run build >> ' + BUILD_LOG + ' 2>&1', (err) => {
      if (err) {
        log('❌ Build failed');
        building = false;
        return;
      }
      log('✅ Build complete — starting server...');
      run('node_modules/.bin/next start -p 3000 >> /var/www/seravavatar-hub/logs/next.log 2>&1 &', () => {
        building = false;
        log('🚀 Server ready at https://seravavatar-hub.95.217.8.52.nip.io');
      });
    });
  });
}

// Debounce: wait 3s after last save before rebuilding
function debounce() {
  if (buildTimer) clearTimeout(buildTimer);
  log('📝 Change detected, waiting...');
  buildTimer = setTimeout(build, 3000);
}

// Recursive watch on src/
function watchDir(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        fs.watch(full, (evt, fname) => {
          if (fname && !fname.startsWith('.')) debounce();
        });
        watchDir(full);
      }
    }
  } catch (e) {}
}

log('👀 Watching src/ for changes...');
log('💡 Edit any file in src/ — auto-rebuild starts in 3 seconds after you save');
log('🛑 Press Ctrl+C to stop the watcher\n');
watchDir(path.join(ROOT, 'src'));
