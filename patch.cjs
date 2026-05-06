const fs = require('fs');
['gas/Handlers.gs', 'gas/Code.gs'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/GmailApp\.sendEmail/g, 'MailApp.sendEmail');
  fs.writeFileSync(file, content, 'utf8');
});
console.log('Replaced GmailApp with MailApp successfully.');
