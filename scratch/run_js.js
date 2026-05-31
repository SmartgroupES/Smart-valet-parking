const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const html = fs.readFileSync('frontend/index.html', 'utf8');

process.on('unhandledRejection', (reason) => {
  console.log('REJECTION:', reason.message, reason.stack);
  process.exit(1);
});

const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously" });
setTimeout(() => console.log('Done'), 1000);
