const XLSX = require('xlsx');
const { execSync } = require('child_process');
const fs = require('fs');

const filePath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

async function sync() {
    try {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);
        const activeExcel = excelData.filter(r => r['Estatus'] === 'ACTIVO');

        console.log(`Excel: ${activeExcel.length} empleados activos.`);

        const sqlCommands = [];

        // 1. Limpiar personal previo (incluyendo el rol 'driver' que detectamos en DB)
        sqlCommands.push("DELETE FROM users WHERE role IN ('valet', 'supervisor', 'driver')");

        // 2. Preparar inserciones
        activeExcel.forEach(r => {
            const nombre = (r['Primer_Nombre'] || '').trim();
            const apellido = (r['Primer_Apellido'] || '').trim();
            const name = `${nombre} ${apellido}`.toUpperCase().replace(/\./g, '').trim();
            
            const cedula = r['Cédula'] ? r['Cédula'].toString() : '';
            const phone = r['Teléfono 1'] || '';
            const sector = (r['Sector o Urbanización'] || '').toString();
            
            let role = 'valet';
            const cargo = (r['Cargo EYE STAFF'] || '').toUpperCase();
            if (cargo.includes('JEFE') || cargo.includes('SUPERVISOR') || cargo.includes('COORDINADOR')) {
                role = 'supervisor';
            }
            
            const prefix = role === 'supervisor' ? 'P' : 'L';
            const suffix = cedula.length >= 3 ? cedula.slice(-3) : Math.floor(Math.random() * 900 + 100).toString();
            const pin = prefix + suffix;
            
            sqlCommands.push(`INSERT INTO users (name, pin_hash, role, cedula, phone, sector, created_at) VALUES ('${name.replace(/'/g, "''")}', '${pin}', '${role}', '${cedula}', '${phone}', '${sector.replace(/'/g, "''")}', datetime('now'))`);
        });

        console.log(`Generados ${sqlCommands.length} comandos.`);
        
        // Ejecutar en un solo archivo (intentaremos de nuevo, 39 comandos es poco)
        const tempSql = 'scratch/sync_staff_final.sql';
        fs.writeFileSync(tempSql, sqlCommands.join(';\n') + ';');
        
        console.log('Ejecutando SQL en D1...');
        execSync(`npx wrangler d1 execute valet-db --remote -y --file=${tempSql}`, { stdio: 'inherit' });

        console.log('Sincronización completada con éxito.');

    } catch (e) {
        console.error('Error en sincronización:', e);
    }
}

sync();
