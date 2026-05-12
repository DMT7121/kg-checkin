const fs = require('fs');
const path = require('path');

const directories = ['src/pages', 'src/pages/admin'];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // We look for class names that contain bg-gradient-to-r but not soft3d-card
      // Specifically the header banners.
      
      // Replace <div className="bg-gradient-to-r from-... rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-4">
      // with <div className="soft3d-card !bg-gradient-to-r from-... p-6 md:p-8 text-white relative overflow-hidden flex items-center justify-between mb-4 border-opacity-30">
      
      // regex to find class string starting with bg-gradient-to-r inside className=""
      const regex = /className="([^"]*bg-gradient-to-[brt]+[^"]*)"/g;
      
      content = content.replace(regex, (match, p1) => {
        if (!p1.includes('soft3d-card') && !p1.includes('rounded-xl') && p1.includes('rounded-') && p1.includes('text-white')) {
          let newClass = p1.replace(/bg-gradient-to/g, '!bg-gradient-to');
          // remove rounded-3xl, rounded-2xl
          newClass = newClass.replace(/rounded-(3xl|2xl|xl)/g, '');
          // remove shadows
          newClass = newClass.replace(/shadow-(xl|lg|md|sm)/g, '');
          newClass = newClass.replace(/shadow-\[[^\]]+\]/g, '');
          // remove specific shadow colors like shadow-ocean-500/20
          newClass = newClass.replace(/shadow-[a-z]+-[0-9]+\/[0-9]+/g, '');
          
          newClass = `soft3d-card ${newClass} border-opacity-30`.replace(/\s+/g, ' ').trim();
          return `className="${newClass}"`;
        }
        return match;
      });

      if (content !== fs.readFileSync(fullPath, 'utf8')) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated gradients in: ${fullPath}`);
      }
    }
  }
}

directories.forEach(processDirectory);
console.log('Gradients updated to soft3d-card!');
