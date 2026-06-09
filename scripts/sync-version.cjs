const fs = require('fs');
const v = process.argv[2];

if (!v) {
  console.error('Error: version argument required');
  process.exit(1);
}

// Update Cargo.toml
let cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace(/^version = "[^"]*"/m, `version = "${v}"`);
fs.writeFileSync('src-tauri/Cargo.toml', cargo);

// Update tauri.conf.json
let tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
tauri.package.version = v;
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauri, null, 2) + '\n');

console.log(`Synced version ${v} to Cargo.toml + tauri.conf.json`);
