const fs = require('fs');
const path = require('path');

const directories = ['src/pages', 'src/components', 'src'];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (fullPath !== 'src/store' && fullPath !== 'src/services' && fullPath !== 'src/utils') {
        processDirectory(fullPath);
      }
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let newContent = content.replace(/artisan-bg/g, 'soft3d-bg');
      newContent = newContent.replace(/artisan-card/g, 'soft3d-card');
      newContent = newContent.replace(/artisan-btn-primary/g, 'soft3d-btn-primary');
      newContent = newContent.replace(/artisan-btn/g, 'soft3d-btn');

      if (newContent !== content) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

directories.forEach(processDirectory);
console.log('Soft 3D Pastel style applied globally!');
