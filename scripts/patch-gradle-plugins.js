const fs = require('fs');
const path = require('path');

function patchFile(filePath) {
  console.log(`Checking file for patch: ${filePath}`);
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('-Xskip-metadata-version-check')) {
    console.log(`Already patched: ${filePath}`);
    return;
  }

  const isKts = filePath.endsWith('.kts');
  if (isKts) {
    content += `
// Added by patch script to fix Kotlin metadata version mismatch
tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions {
        freeCompilerArgs = freeCompilerArgs + "-Xskip-metadata-version-check"
    }
}
`;
  } else {
    content += `
// Added by patch script to fix Kotlin metadata version mismatch
tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    kotlinOptions {
        freeCompilerArgs = freeCompilerArgs + "-Xskip-metadata-version-check"
    }
}
`;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Patched: ${filePath}`);
}

function searchDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (file === 'expo-dev-launcher-gradle-plugin') {
          console.log(`Found plugin folder: ${filePath}`);
          const gradleFile = path.join(filePath, 'build.gradle');
          const gradleKtsFile = path.join(filePath, 'build.gradle.kts');
          if (fs.existsSync(gradleFile)) patchFile(gradleFile);
          if (fs.existsSync(gradleKtsFile)) patchFile(gradleKtsFile);
        } else if (file === '.pnpm' || file === 'node_modules') {
          searchDir(filePath);
        } else if (file.startsWith('expo-dev-launcher')) {
          searchDir(filePath);
        } else if (dir.endsWith('node_modules') && !file.startsWith('.')) {
          searchDir(filePath);
        }
      }
    } catch (err) {
      // Ignore files we cannot access
    }
  }
}

const nodeModulesDir = path.join(__dirname, '..', 'node_modules');
if (fs.existsSync(nodeModulesDir)) {
  console.log('Searching node_modules to patch expo-dev-launcher-gradle-plugin...');
  searchDir(nodeModulesDir);
  console.log('Search and patch completed.');
} else {
  console.log('node_modules directory not found.');
}
