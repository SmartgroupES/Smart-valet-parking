const fs = require('fs');
const path = require('path');

const version = 'v2.5.56';

const filesToBackup = [
    { src: 'frontend/index.html', dest: `backup_${version.replace(/\./g, '')}_index.html` },
    { src: 'src/index.ts', dest: `backup_${version.replace(/\./g, '')}_index.ts` },
    { src: 'whatsapp-service/src/index.ts', dest: `backup_${version.replace(/\./g, '')}_whatsapp.ts` }
];

for (const file of filesToBackup) {
    if (fs.existsSync(file.src)) {
        fs.copyFileSync(file.src, file.dest);
        console.log(`Copied ${file.src} to ${file.dest}`);
    } else {
        console.log(`Could not find ${file.src}`);
    }
}
