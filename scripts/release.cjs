#!/usr/bin/env node
/**
 * Release Script for MarkdownUI
 * 
 * Usage: 
 *   node scripts/release.cjs [patch|minor|major]     - Create new release
 *   node scripts/release.cjs --retag                 - Delete and recreate current tag
 * 
 * This script:
 * 1. Bumps the version in package.json, Cargo.toml, and tauri.conf.json
 * 2. Commits the version changes
 * 3. Creates a git tag
 * 4. Pushes the commit and tag to GitHub
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);

// Handle --retag option
if (args.includes('--retag')) {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;
    const tag = `v${currentVersion}`;

    console.log(`\n🔄 Re-tagging version: ${tag}\n`);

    try {
        // Delete local tag
        try {
            execSync(`git tag -d ${tag}`, { stdio: 'inherit' });
            console.log(`✅ Deleted local tag ${tag}`);
        } catch {
            console.log(`ℹ️  Local tag ${tag} didn't exist`);
        }

        // Delete remote tag
        try {
            execSync(`git push origin :refs/tags/${tag}`, { stdio: 'inherit' });
            console.log(`✅ Deleted remote tag ${tag}`);
        } catch {
            console.log(`ℹ️  Remote tag ${tag} didn't exist`);
        }

        // Recreate and push tag
        execSync(`git tag ${tag}`, { stdio: 'inherit' });
        execSync(`git push origin ${tag}`, { stdio: 'inherit' });

        console.log(`\n🎉 Tag ${tag} recreated and pushed!`);
        console.log('   GitHub Actions will now retry the build.\n');
    } catch (error) {
        console.error('\n❌ Re-tag failed:', error.message);
        process.exit(1);
    }
    process.exit(0);
}

// Normal release flow
const bumpType = args[0] || 'patch';

if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Usage:');
    console.error('  node scripts/release.cjs [patch|minor|major]  - Create new release');
    console.error('  node scripts/release.cjs --retag              - Delete and recreate current tag');
    process.exit(1);
}

// Read current version from package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

// Calculate new version
const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion;
switch (bumpType) {
    case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
    case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
    case 'patch':
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
}

console.log(`\n📦 Bumping version: ${currentVersion} → ${newVersion}\n`);

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✅ Updated package.json');

// Update Cargo.toml
const cargoTomlPath = path.join(__dirname, '..', 'src-tauri', 'Cargo.toml');
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
cargoToml = cargoToml.replace(
    /^version = "[\d.]+"$/m,
    `version = "${newVersion}"`
);
fs.writeFileSync(cargoTomlPath, cargoToml);
console.log('✅ Updated Cargo.toml');

// Update tauri.conf.json
const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.package.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 4) + '\n');
console.log('✅ Updated tauri.conf.json');

// Git operations
console.log('\n🔖 Creating git commit and tag...\n');

try {
    execSync('git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json', { stdio: 'inherit' });
    execSync(`git commit -m "chore: bump version to ${newVersion}"`, { stdio: 'inherit' });
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });

    console.log(`\n✅ Created tag: v${newVersion}`);
    console.log('\n📤 Pushing to GitHub...\n');

    execSync('git push', { stdio: 'inherit' });
    execSync('git push --tags', { stdio: 'inherit' });

    console.log(`\n🎉 Release v${newVersion} pushed successfully!`);
    console.log('   GitHub Actions will now build and create the release.\n');
} catch (error) {
    console.error('\n❌ Git operation failed:', error.message);
    process.exit(1);
}
