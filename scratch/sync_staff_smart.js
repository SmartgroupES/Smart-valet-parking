const XLSX = require('xlsx');
const { execSync } = require('child_process');
const fs = require('fs');

const inputExcelPath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

async function sync() {
    try {
        // 1. Sincronización desde Excel (solo si existe el archivo)
        if (fs.existsSync(inputExcelPath)) {
            console.log(`Cargando Excel desde ${inputExcelPath}...`);
            const workbook = XLSX.readFile(inputExcelPath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const excelData = XLSX.utils.sheet_to_json(sheet);
            const activeExcel = excelData.filter(r => r['Estatus'] === 'ACTIVO');

            // Cargar DB para comparar
            const dbRes = JSON.parse(execSync('npx wrangler d1 execute valet-db --remote --command="SELECT * FROM users WHERE role IN (\'valet\', \'supervisor\');" --json').toString());
            const dbUsers = dbRes[0].results || [];

            console.log(`Excel: ${activeExcel.length} activos. DB: ${dbUsers.length} valets/supervisores.`);

            const sqlCommands = [];

            function normalize(name) {
                if (!name) return '';
                if (name.includes(',')) {
                    const parts = name.split(',').map(s => s.trim());
                    return (parts[1] + ' ' + parts[0]).toUpperCase();
                }
                return name.toUpperCase().replace(/\./g, '').trim();
            }

            const processedDbIds = new Set();

            activeExcel.forEach(exUser => {
                const exName = `${exUser['Primer_Nombre']} ${exUser['Primer_Apellido']}`.toUpperCase().replace(/\./g, '').trim();
                const exCi = exUser['Cédula'] ? exUser['Cédula'].toString() : '';
                
                let dbMatch = dbUsers.find(u => u.cedula === exCi);
                if (!dbMatch) {
                    dbMatch = dbUsers.find(u => normalize(u.name) === exName);
                }

                let role = 'valet';
                const cargo = (exUser['Cargo EYE STAFF'] || '').toUpperCase();
                if (cargo.includes('JEFE') || cargo.includes('SUPERVISOR') || cargo.includes('COORDINADOR')) {
                    role = 'supervisor';
                }
                
                const phone = exUser['Teléfono 1'] || '';
                const sector = exUser['Sector o Urbanización'] || '';

                if (dbMatch) {
                    sqlCommands.push(`UPDATE users SET name='${exName.replace(/'/g, "''")}', role='${role}', cedula='${exCi}', phone='${phone}', sector='${sector.replace(/'/g, "''")}' WHERE id=${dbMatch.id};`);
                    processedDbIds.add(dbMatch.id);
                } else {
                    const prefix = role === 'supervisor' ? 'P' : 'L';
                    const suffix = exCi.length >= 3 ? exCi.slice(-3) : Math.floor(Math.random() * 900 + 100).toString();
                    const pin = prefix + suffix;
                    sqlCommands.push(`INSERT INTO users (name, pin_hash, role, cedula, phone, sector, created_at) VALUES ('${exName.replace(/'/g, "''")}', '${pin}', '${role}', '${exCi}', '${phone}', '${sector.replace(/'/g, "''")}', datetime('now'));`);
                }
            });

            dbUsers.forEach(u => {
                if (!processedDbIds.has(u.id)) {
                    sqlCommands.push(`DELETE FROM users WHERE id=${u.id};`);
                }
            });

            if (sqlCommands.length > 0) {
                console.log(`Ejecutando ${sqlCommands.length} actualizaciones...`);
                const batchSize = 10;
                for (let i = 0; i < sqlCommands.length; i += batchSize) {
                    const batch = sqlCommands.slice(i, i + batchSize).join(';');
                    execSync(`npx wrangler d1 execute valet-db --remote -y --command="${batch.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
                }
            }
            console.log('Sincronización completada.');
        } else {
            console.log('No se encontró archivo de carga Excel. Saltando sincronización.');
        }

        // 2. Generar Documentos de Salida (Markdown y Excel)
        console.log('Consultando base de datos para generar reportes...');
        const finalDbRes = JSON.parse(execSync('npx wrangler d1 execute valet-db --remote --command="SELECT name, role, pin_hash FROM users ORDER BY role, name;" --json').toString());
        const allUsers = finalDbRes[0].results || [];

        const roleLabels = {
            'director': 'Directores (Acceso Total)',
            'supervisor': 'Supervisores',
            'driver': 'Drivers (Valet)',
            'valet': 'Drivers (Valet)',
            'logistics': 'Logística'
        };

        const roleGroups = [
            { key: 'director', label: 'Directores (Acceso Total)' },
            { key: 'supervisor', label: 'Supervisores' },
            { key: 'driver', label: 'Drivers (Valet)' },
            { key: 'valet', label: 'Drivers (Valet)' },
            { key: 'logistics', label: 'Logística' }
        ];

        // Generar Markdown
        let mdContent = `# Roles y Acceso Portal EYE STAFF\n\nEste documento contiene la lista actualizada de perfiles y sus credenciales de acceso al portal.\n\n`;
        roleGroups.forEach(group => {
            const usersByRole = allUsers.filter(u => u.role === group.key);
            if (usersByRole.length > 0) {
                mdContent += `## ${group.label}\n| Nombre | PIN / Acceso |\n| :--- | :--- |\n`;
                usersByRole.forEach(u => {
                    mdContent += `| ${u.name} | \`${u.pin_hash}\` |\n`;
                });
                mdContent += `\n`;
            }
        });
        mdContent += `---\n*Última actualización: ${new Date().toISOString().split('T')[0]}*\n`;
        fs.writeFileSync('/Users/nelsoncarrillokosak/valet-eye/documentos/Roles y acceso portal EYE STAFF.md', mdContent);

        // Generar Excel
        const excelDataOutput = allUsers.map(u => ({
            'Nombre': u.name,
            'Rol': roleLabels[u.role] || u.role,
            'PIN / Acceso': u.pin_hash
        }));
        const newWorkbook = XLSX.utils.book_new();
        const newWorksheet = XLSX.utils.json_to_sheet(excelDataOutput);
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Roles y Accesos');
        XLSX.writeFile(newWorkbook, '/Users/nelsoncarrillokosak/valet-eye/documentos/Roles y acceso portal EYE STAFF.xlsx');

        console.log('Reportes actualizados en documentos/.');

    } catch (e) {
        console.error('Error en el proceso:', e);
    }
}

sync();
