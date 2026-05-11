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
      
      // We will just do simple string replacements to be safe and catch all permutations
      
      // Replace backgrounds
      let newContent = content.replace(/bg-white dark:bg-gray-800/g, 'origami-card');
      newContent = newContent.replace(/bg-gray-50 dark:bg-gray-700\/40/g, 'paper-layer');
      newContent = newContent.replace(/bg-gray-50 dark:bg-gray-800/g, 'paper-layer');
      newContent = newContent.replace(/bg-gray-100 dark:bg-gray-800/g, 'paper-layer');
      newContent = newContent.replace(/bg-white\/80 dark:bg-gray-800\/80 backdrop-blur-md/g, 'origami-card');

      // Replace generic wrappers
      newContent = newContent.replace(/bg-gray-50 dark:bg-gray-900/g, 'origami-bg');
      newContent = newContent.replace(/bg-gray-100 dark:bg-gray-900/g, 'origami-bg');

      // Remove specific redundant borders/shadows that origami already provides
      newContent = newContent.replace(/shadow-sm/g, '');
      newContent = newContent.replace(/border border-gray-100 dark:border-gray-700/g, '');
      newContent = newContent.replace(/border border-gray-100 dark:border-gray-600/g, '');
      
      // Change buttons
      newContent = newContent.replace(/bg-gradient-to-r from-\[#1856FF\] to-\[#0ea5e9\] text-white/g, 'origami-btn-primary');
      newContent = newContent.replace(/bg-gradient-to-r from-ocean-600 to-blue-600/g, 'origami-btn-primary');
      newContent = newContent.replace(/bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600/g, 'origami-btn');

      if (newContent !== content) {
        fs.writeFileSync(fullPath, newContent, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

directories.forEach(processDirectory);
console.log('Very Aggressive Origami style applied globally!');
