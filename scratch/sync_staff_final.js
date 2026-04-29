const XLSX = require('xlsx');
const fs = require('fs');

const filePath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Filtrar solo empleados activos
    const activeEmployees = data.filter(r => r['Estatus'] === 'ACTIVO');

    const sqlCommands = [];

    // Lista de cédulas en el Excel para el borrado selectivo
    const excelCedulas = activeEmployees.map(r => r['Cédula'] ? r['Cédula'].toString() : null).filter(Boolean);

    // 1. Eliminar personal (valet/supervisor) que NO esté en el Excel
    if (excelCedulas.length > 0) {
        const cedulaList = excelCedulas.map(c => `'${c}'`).join(',');
        sqlCommands.push(`DELETE FROM users WHERE role IN ('valet', 'supervisor') AND cedula NOT IN (${cedulaList});`);
    } else {
        sqlCommands.push(`DELETE FROM users WHERE role IN ('valet', 'supervisor');`);
    }

    // 2. Procesar inserciones/actualizaciones
    activeEmployees.forEach(r => {
        const nombre = (r['Primer_Nombre'] || '').trim();
        const apellido = (r['Primer_Apellido'] || '').trim();
        const name = `${nombre} ${apellido}`.toUpperCase();
        
        const cedula = r['Cédula'] ? r['Cédula'].toString() : '';
        const phone = r['Teléfono 1'] || '';
        const sector = r['Sector o Urbanización'] || '';
        
        let role = 'valet';
        const cargo = (r['Cargo EYE STAFF'] || '').toUpperCase();
        if (cargo.includes('JEFE') || cargo.includes('SUPERVISOR') || cargo.includes('COORDINADOR')) {
            role = 'supervisor';
        }
        
        // Generación de PIN (Prefijo + últimos 3 de cédula o 000 si no hay)
        const prefix = role === 'supervisor' ? 'P' : 'L';
        const suffix = cedula.length >= 3 ? cedula.slice(-3) : '000';
        const pin = prefix + suffix;
        
        // Evitar duplicados eliminando antes de insertar (Upsert manual)
        if (cedula) {
            sqlCommands.push(`DELETE FROM users WHERE cedula = '${cedula}';`);
        } else {
            sqlCommands.push(`DELETE FROM users WHERE name = '${name.replace(/'/g, "''")}';`);
        }
        
        sqlCommands.push(`INSERT INTO users (name, pin_hash, role, cedula, phone, sector, created_at) VALUES ('${name.replace(/'/g, "''")}', '${pin}', '${role}', '${cedula}', '${phone}', '${sector.replace(/'/g, "''")}', datetime('now'));`);
    });

    fs.writeFileSync('scratch/sync_staff_v2.sql', sqlCommands.join('\n'));
    console.log(`Script generado con éxito: ${activeEmployees.length} empleados activos procesados.`);
} catch (e) {
    console.error('Error procesando Excel:', e);
}
