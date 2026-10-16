const fs = require('fs');
const path = require('path');

const directories = ['src/pages', 'src/components'];

const replacements = [
  // Cards / Containers
  {
    regex: /bg-white dark:bg-gray-800 rounded-[a-z0-9]+ p-(\d+) shadow-sm border border-gray-100 dark:border-gray-700/g,
    replace: 'origami-card p-$1'
  },
  {
    regex: /bg-white dark:bg-gray-800 rounded-[a-z0-9]+ shadow-sm border border-gray-100 dark:border-gray-700/g,
    replace: 'origami-card'
  },
  {
    regex: /bg-white dark:bg-gray-800 rounded-[a-z0-9]+/g,
    replace: 'origami-card'
  },
  {
    regex: /bg-white dark:bg-gray-900 shadow-2xl/g,
    replace: 'origami-bg shadow-2xl'
  },
  // Sub-items / Layers
  {
    regex: /bg-gray-50 dark:bg-gray-700\/40 rounded-[a-z0-9]+ p-(\d+)((\.\d+)?) border border-gray-100 dark:border-gray-600/g,
    replace: 'paper-layer p-$1$2'
  },
  {
    regex: /bg-gray-50 dark:bg-gray-700\/40 rounded-[a-z0-9]+ p-(\d+)((\.\d+)?)/g,
    replace: 'paper-layer p-$1$2'
  },
  {
    regex: /bg-gray-50 dark:bg-gray-800 rounded-[a-z0-9]+/g,
    replace: 'paper-layer'
  },
  {
    regex: /bg-gray-100 dark:bg-gray-800 rounded-[a-z0-9]+/g,
    replace: 'paper-layer'
  },
  // Floating Actions / Primary Buttons
  {
    regex: /bg-gradient-to-r from-\[#1856FF\] to-\[#0ea5e9\] text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-blue-500\/40 transition transform active:scale-95/g,
    replace: 'origami-btn-primary font-bold py-3 flex items-center justify-center'
  },
  {
    regex: /bg-gradient-to-r from-ocean-600 to-blue-600/g,
    replace: 'origami-btn-primary'
  }
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      for (const rule of replacements) {
        const newContent = content.replace(rule.regex, rule.replace);
        if (newContent !== content) {
          content = newContent;
          changed = true;
        }
      }

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

directories.forEach(processDirectory);
console.log('Origami style applied globally!');
