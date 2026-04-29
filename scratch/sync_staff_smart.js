const XLSX = require('xlsx');
const { execSync } = require('child_process');
const fs = require('fs');

const filePath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

async function sync() {
    try {
        // 1. Cargar Excel
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);
        const activeExcel = excelData.filter(r => r['Estatus'] === 'ACTIVO');

        // 2. Cargar DB
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
        const processedExcelCis = new Set();

        // 3. Emparejar y Actualizar
        activeExcel.forEach(exUser => {
            const exName = `${exUser['Primer_Nombre']} ${exUser['Primer_Apellido']}`.toUpperCase().replace(/\./g, '').trim();
            const exCi = exUser['Cédula'] ? exUser['Cédula'].toString() : '';
            
            // Buscar por Cédula primero, luego por Nombre
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
                // UPDATE
                sqlCommands.push(`UPDATE users SET name='${exName.replace(/'/g, "''")}', role='${role}', cedula='${exCi}', phone='${phone}', sector='${sector.replace(/'/g, "''")}' WHERE id=${dbMatch.id};`);
                processedDbIds.add(dbMatch.id);
            } else {
                // INSERT
                const prefix = role === 'supervisor' ? 'P' : 'L';
                const suffix = exCi.length >= 3 ? exCi.slice(-3) : Math.floor(Math.random() * 900 + 100).toString();
                const pin = prefix + suffix;
                sqlCommands.push(`INSERT INTO users (name, pin_hash, role, cedula, phone, sector, created_at) VALUES ('${exName.replace(/'/g, "''")}', '${pin}', '${role}', '${exCi}', '${phone}', '${sector.replace(/'/g, "''")}', datetime('now'));`);
            }
            processedExcelCis.add(exCi);
        });

        // 4. Eliminar los que NO están en Excel
        dbUsers.forEach(u => {
            if (!processedDbIds.has(u.id)) {
                sqlCommands.push(`DELETE FROM users WHERE id=${u.id};`);
            }
        });

        // 5. Ejecutar en batches
        console.log(`Generados ${sqlCommands.length} comandos.`);
        const batchSize = 10;
        for (let i = 0; i < sqlCommands.length; i += batchSize) {
            const batch = sqlCommands.slice(i, i + batchSize).join(';');
            console.log(`Ejecutando lote ${i/batchSize + 1}...`);
            execSync(`npx wrangler d1 execute valet-db --remote -y --command="${batch.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
        }

        console.log('Sincronización completada con éxito.');

    } catch (e) {
        console.error('Error en sincronización:', e);
    }
}

sync();
