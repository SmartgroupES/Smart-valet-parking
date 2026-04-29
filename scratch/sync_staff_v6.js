const XLSX = require('xlsx');
const { execSync } = require('child_process');
const fs = require('fs');

const filePath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

async function sync() {
    try {
        console.log('Leyendo Excel...');
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);
        
        console.log(`Excel leido: ${excelData.length} registros encontrados.`);

        const sqlCommands = [];

        // 1. EL PROCESAMIENTO AHORA SE HACE EN LA FUNCIÓN PRINCIPAL
        // Aquí solo generamos las inserciones

        // 2. PROCESAR CADA REGISTRO
        excelData.forEach(r => {
            const nombre = (r['Primer_Nombre'] || '').trim();
            const apellido = (r['Primer_Apellido'] || '').trim();
            const name = `${nombre} ${apellido}`.toUpperCase().replace(/\./g, '').trim();
            
            const cedula = r['Cédula'] ? r['Cédula'].toString() : '';
            const phone = r['Teléfono 1'] || '';
            const sector = (r['Sector o Urbanización'] || '').toString();
            const email = (r['Email'] || '').toString();
            const address = (r['Dirección '] || '').toString();
            const birthDate = (r['Fecha de Nacimiento'] || '').toString();
            const cargo = (r['Cargo EYE STAFF'] || '').toString();
            const estatus = (r['Estatus'] || 'ACTIVO').toString();
            
            // Determinar rol interno para permisos
            let role = 'driver';
            const cargoUpper = cargo.toUpperCase();
            if (cargoUpper.includes('JEFE') || cargoUpper.includes('SUPERVISOR') || cargoUpper.includes('COORDINADOR') || cargoUpper.includes('DIRECTOR')) {
                role = 'supervisor';
            }
            if (cargoUpper.includes('DIRECTOR') || cargoUpper.includes('GERENTE')) {
                role = 'director';
            }
            
            // Generar PIN (L para Valet, P para Supervisor/Director + últimos 3 de cédula)
            const prefix = (role === 'supervisor' || role === 'director') ? 'P' : 'L';
            const suffix = cedula.length >= 3 ? cedula.slice(-3) : Math.floor(Math.random() * 900 + 100).toString();
            const pin = prefix + suffix;
            
            const columns = [
                'name', 'pin_hash', 'role', 'cedula', 'phone', 'sector', 
                'email', 'address', 'birth_date', 'cargo', 'status', 'created_at'
            ];
            
            const values = [
                `'${name.replace(/'/g, "''")}'`,
                `'${pin}'`,
                `'${role}'`,
                `'${cedula}'`,
                `'${phone}'`,
                `'${sector.replace(/'/g, "''")}'`,
                `'${email.replace(/'/g, "''")}'`,
                `'${address.replace(/'/g, "''")}'`,
                `'${birthDate}'`,
                `'${cargo.replace(/'/g, "''")}'`,
                `'${estatus}'`,
                "datetime('now')"
            ];
            
            sqlCommands.push(`INSERT INTO users (${columns.join(', ')}) VALUES (${values.join(', ')});`);
        });

        console.log(`Generados ${sqlCommands.length} comandos SQL.`);
        
        const tempSql = 'scratch/sync_staff_final.sql';
        fs.writeFileSync(tempSql, sqlCommands.join('\n'));
        
        console.log('Limpiando tablas dependientes...');
        const tablesToDelete = ['staff_attendance', 'events', 'shifts', 'users'];
        for (const table of tablesToDelete) {
            try {
                execSync(`npx wrangler d1 execute valet-db --local --command="DELETE FROM ${table};"`, { stdio: 'ignore' });
                execSync(`npx wrangler d1 execute valet-db --remote --command="DELETE FROM ${table};"`, { stdio: 'ignore' });
            } catch (e) {}
        }

        console.log('Ejecutando inserciones en D1 (Local)...');
        execSync(`npx wrangler d1 execute valet-db --local -y --file=${tempSql}`, { stdio: 'inherit' });
        console.log('Sincronización local completada.');

        console.log('Ejecutando inserciones en D1 (Remoto)...');
        // Usar el script de batch para el remoto para evitar "fetch failed"
        const remoteSyncScript = 'scratch/sync_staff_remote.js';
        execSync(`node ${remoteSyncScript}`, { stdio: 'inherit' });
        console.log('Sincronización remota completada.');

    } catch (e) {
        console.error('Error en sincronización:', e);
    }
}

sync();
