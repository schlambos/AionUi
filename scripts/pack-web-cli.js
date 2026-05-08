#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { prepareAionuiBackend } = require('../packages/shared-scripts/src/prepare-aionui-backend.js');
// prepareBundledBun retired: backend now ships its own bun runtime.
// See handoff for full cleanup TODO.

const projectRoot = path.resolve(__dirname, '..');
const platform = process.env.PACK_PLATFORM || process.platform;
const arch = process.env.PACK_ARCH || process.arch;
const version = require('../package.json').version;

// Normalize platform/arch names for tarball filename
const platformMap = { darwin: 'darwin', linux: 'linux', win32: 'win' };
const archMap = { arm64: 'arm64', x64: 'x86_64', ia32: 'x86' };
const normalizedPlatform = platformMap[platform] || platform;
const normalizedArch = archMap[arch] || arch;

const tarballName = `aionui-web-${version}-${normalizedPlatform}-${normalizedArch}.tar.gz`;
const distDir = path.join(projectRoot, 'dist-web-cli');
const tarballPath = path.join(distDir, tarballName);

console.log(`Packing web-cli for ${platform}-${arch}...`);

// 1. Prepare bundled-aionui-backend
console.log('1. Preparing aionui-backend...');
prepareAionuiBackend({
  projectRoot,
  platform,
  arch,
  version: process.env.AIONUI_BACKEND_VERSION || 'latest',
  allowMissing: process.env.AIONUI_BACKEND_ALLOW_MISSING === '1',
});

// 2. bundled-bun step skipped — backend ships its own bun runtime.

// 3. Build web-cli TypeScript
console.log('3. Building web-cli...');
execSync('bun run build', { cwd: path.join(projectRoot, 'packages/web-cli'), stdio: 'inherit' });

// 4. Copy static files from desktop renderer build output
console.log('4. Copying static files...');
const rendererOutDir = path.join(projectRoot, 'packages/desktop/out/renderer');
const staticDir = path.join(projectRoot, 'packages/web-cli/static');
if (fs.existsSync(rendererOutDir)) {
  fs.cpSync(rendererOutDir, staticDir, { recursive: true });
} else {
  console.warn('⚠️ Desktop renderer build output not found, skipping static files');
}

// 5. Create tarball structure
console.log('5. Creating tarball...');
const stagingDir = path.join(distDir, 'staging');
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

const tarballContentDir = path.join(stagingDir, 'aionui-web');
fs.mkdirSync(tarballContentDir, { recursive: true });

// Copy web-cli dist
fs.cpSync(path.join(projectRoot, 'packages/web-cli/dist'), path.join(tarballContentDir, 'dist'), { recursive: true });
fs.cpSync(path.join(projectRoot, 'packages/web-cli/bin'), path.join(tarballContentDir, 'bin'), { recursive: true });
fs.cpSync(path.join(projectRoot, 'packages/web-cli/package.json'), path.join(tarballContentDir, 'package.json'));

// Copy bundled-aionui-backend
const backendSrc = path.join(projectRoot, 'resources/bundled-aionui-backend', `${platform}-${arch}`);
const backendDest = path.join(tarballContentDir, 'bundled-aionui-backend', `${platform}-${arch}`);
fs.mkdirSync(path.dirname(backendDest), { recursive: true });
fs.cpSync(backendSrc, backendDest, { recursive: true });

// bundled-bun no longer copied — backend ships its own bun runtime.

// Copy static files
if (fs.existsSync(staticDir)) {
  fs.cpSync(staticDir, path.join(tarballContentDir, 'static'), { recursive: true });
}

// 6. Create tarball
fs.mkdirSync(distDir, { recursive: true });
execSync(`tar -czf ${path.basename(tarballPath)} -C ${stagingDir} aionui-web`, {
  cwd: path.dirname(tarballPath),
  stdio: 'inherit',
});

console.log(`✅ Tarball created: ${tarballPath}`);

// 7. Generate SHA256 checksum (cross-platform: use Node's crypto, not `shasum`)
const checksumPath = `${tarballPath}.sha256`;
const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(tarballPath));
const digest = hash.digest('hex');
// Match shasum format: "<hash>  <filename>\n"
fs.writeFileSync(checksumPath, `${digest}  ${path.basename(tarballPath)}\n`);
console.log(`✅ Checksum created: ${checksumPath}`);

console.log('Done!');
