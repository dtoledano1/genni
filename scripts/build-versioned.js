#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively copy files from source to destination
 */
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  
  if (stats.isDirectory()) {
    // Create directory if it doesn't exist
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // Copy all files in directory
    const files = fs.readdirSync(src);
    for (const file of files) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    // Copy file
    fs.copyFileSync(src, dest);
  }
}

/**
 * Remove directory and all its contents
 */
function removeDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

try {
  // Read version from manifest.json
  const manifestPath = path.join(__dirname, '../public/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const version = manifest.version;
  
  console.log(`📦 Building extension version: ${version}`);
  
  // Define paths
  const distPath = path.join(__dirname, '../dist');
  const versionedPath = path.join(distPath, version);
  const tempDistPath = path.join(__dirname, '../dist-temp');
  
  // Check if dist folder exists
  if (!fs.existsSync(distPath)) {
    console.error('❌ dist folder not found. Please run "npm run build" first.');
    process.exit(1);
  }
  
  // Create versioned folder
  console.log(`📁 Creating versioned folder: dist/${version}/`);
  if (fs.existsSync(versionedPath)) {
    removeDirectory(versionedPath);
  }
  fs.mkdirSync(versionedPath, { recursive: true });
  
  // Copy all current dist contents to versioned folder
  console.log(`📋 Copying build files to dist/${version}/`);
  const distFiles = fs.readdirSync(distPath);
  for (const file of distFiles) {
    const srcPath = path.join(distPath, file);
    const destPath = path.join(versionedPath, file);
    
    // Skip the version folder itself
    if (file === version) continue;
    
    copyRecursive(srcPath, destPath);
  }
  
  // Copy manifest.json to versioned folder
  console.log(`📄 Copying manifest.json to dist/${version}/`);
  fs.copyFileSync(manifestPath, path.join(versionedPath, 'manifest.json'));
  
  // Copy icons to versioned folder if they exist
  const iconsPath = path.join(__dirname, '../public/icons');
  if (fs.existsSync(iconsPath)) {
    console.log(`🎨 Copying icons to dist/${version}/icons/`);
    const versionedIconsPath = path.join(versionedPath, 'icons');
    copyRecursive(iconsPath, versionedIconsPath);
  }
  
  // Clean up: remove all non-versioned files from dist folder
  console.log(`🧹 Cleaning up non-versioned files from dist/`);
  const filesToCleanup = fs.readdirSync(distPath);
  for (const file of filesToCleanup) {
    const filePath = path.join(distPath, file);
    
    // Skip the version folder itself
    if (file === version) continue;
    
    // Remove everything else
    removeDirectory(filePath);
  }
  
  // Create zip file
  console.log(`📦 Creating zip file: dist/${version}.zip`);
  const zipPath = path.join(distPath, `${version}.zip`);

  // Remove any stale archive so the zip tooling starts clean.
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath);
  }

  const zipStrategies = [
    {
      name: 'zip',
      run: () => {
        process.chdir(versionedPath);
        execSync(`zip -r "../${version}.zip" .`, { stdio: 'inherit' });
        process.chdir(path.join(__dirname, '..'));
      }
    },
    {
      name: 'PowerShell Compress-Archive',
      run: () => {
        // Windows fallback: zip the contents of the versioned folder.
        const command =
          `Compress-Archive -Path '${path.join(versionedPath, '*')}' ` +
          `-DestinationPath '${zipPath}' -Force`;
        execSync(`powershell -NoProfile -Command "${command}"`, { stdio: 'inherit' });
      }
    }
  ];

  let zipped = false;
  for (const strategy of zipStrategies) {
    try {
      strategy.run();
      console.log(`📁 Zip file created: dist/${version}.zip (via ${strategy.name})`);
      zipped = true;
      break;
    } catch {
      // Try the next strategy.
    }
  }

  if (!zipped) {
    console.warn('⚠️  Could not create the zip automatically.');
    console.log(`💡 You can manually zip the contents of dist/${version}/ folder`);
  }
  
  console.log(`✅ Extension built successfully in dist/${version}/`);
  console.log(`📦 Ready to package: dist/${version}/ or dist/${version}.zip`);
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
