const fs = require('fs');
const path = require('path');

const directories = ['src/pages', 'src/components'];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // 1. Replace main cards
      let newContent = content.replace(/bg-white dark:bg-gray-800 rounded-[a-z0-9]+(?: shadow-[a-z0-9]+)?(?: border border-gray-100 dark:border-gray-700)?/g, 'origami-card');
      
      // 2. Replace layers
      newContent = newContent.replace(/bg-gray-50 dark:bg-gray-700\/[0-9]+ rounded-[a-z0-9]+(?: border border-gray-100 dark:border-gray-600)?/g, 'paper-layer');
      newContent = newContent.replace(/bg-gray-50 dark:bg-gray-800 rounded-[a-z0-9]+/g, 'paper-layer');
      newContent = newContent.replace(/bg-gray-100 dark:bg-gray-800 rounded-[a-z0-9]+/g, 'paper-layer');

      // 3. Main wrapper in some files
      newContent = newContent.replace(/bg-gray-50 dark:bg-gray-900 min-h-screen/g, 'origami-bg min-h-screen');
      newContent = newContent.replace(/bg-gray-100 dark:bg-gray-900 min-h-screen/g, 'origami-bg min-h-screen');

      // 4. Update the layout wrappers for components that use `max-w-md mx-auto min-h-screen bg-gray-50`
      newContent = newContent.replace(/max-w-md mx-auto min-h-screen bg-gray-50 dark:bg-gray-900/g, 'max-w-md mx-auto min-h-screen origami-bg');

      if (newContent !== content) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

directories.forEach(processDirectory);
console.log('Aggressive Origami style applied globally!');
