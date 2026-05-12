const fs = require('fs');
const path = require('path');

const directories = ['src/pages', 'src/components'];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let newContent = content.replace(/origami-bg/g, 'artisan-bg');
      newContent = newContent.replace(/origami-card/g, 'artisan-card');
      newContent = newContent.replace(/origami-btn-primary/g, 'artisan-btn-primary');
      newContent = newContent.replace(/origami-btn/g, 'artisan-btn');
      newContent = newContent.replace(/paper-layer/g, 'paint-layer');

      if (newContent !== content) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

directories.forEach(processDirectory);
console.log('Artisan Watercolor style applied globally!');
