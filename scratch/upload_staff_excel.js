const XLSX = require('xlsx');
const { execSync } = require('child_process');
const fs = require('fs');

const inputExcelPath = '/Users/nelsoncarrillokosak/Downloads/NUEVO_STAFF.xlsx';

async function sync() {
    try {
        if (!fs.existsSync(inputExcelPath)) {
            console.log(`❌ No se encontró el archivo en: ${inputExcelPath}`);
            console.log(`Por favor, guarda tu Excel con el nombre "NUEVO_STAFF.xlsx" en la carpeta "documentos" y vuelve a ejecutar este script.`);
            return;
        }

        console.log(`Cargando Excel desde ${inputExcelPath}...`);
        const workbook = XLSX.readFile(inputExcelPath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const excelData = XLSX.utils.sheet_to_json(sheet);

        console.log(`Filas leídas del Excel: ${excelData.length}`);

        // Cargar DB para comparar
        console.log('Descargando base de datos actual...');
        const dbRes = JSON.parse(execSync('npx wrangler d1 execute valet-db --remote --command="SELECT id, cedula, name FROM users;" --json').toString());
        const dbUsers = dbRes[0].results || [];

        const sqlCommands = [];

        function normalize(name) {
            if (!name) return '';
            return name.toUpperCase().replace(/\./g, '').trim();
        }

        excelData.forEach((exUser, index) => {
            if (!exUser['Nombre']) return; // saltar filas vacías

            const exName = normalize(exUser['Nombre']);
            const exCi = exUser['Cedula'] ? exUser['Cedula'].toString().trim() : '';
            const email = (exUser['Email'] || '').toString().trim();
            const profile_admin = (exUser['Perfil Admin'] || '').toString().trim().toUpperCase();
            const profile_opera = (exUser['Perfil Opera'] || '').toString().trim().toUpperCase();
            const eye_id = (exUser['EYE ID'] || '').toString().trim().toUpperCase();
            const phone = (exUser['Telefono'] || '').toString().trim();
            const address = (exUser['Direccion'] || '').toString().trim();
            const sector = (exUser['Sector'] || '').toString().trim();
            const bank_name = (exUser['Entidad Bancaria'] || '').toString().trim();
            const bank_account = (exUser['Numero de Cuenta'] || exUser['Número de Cuenta'] || '').toString().trim();
            const emergency_contact = (exUser['Familiar'] || '').toString().trim();
            const emergency_phone = (exUser['TelFamiliar'] || '').toString().trim();
            const is_allergic = (exUser['Alergias'] || '').toString().trim();
            
            // Determinar role base
            let role = 'driver';
            if (profile_admin === 'DIRECTOR') {
                role = 'director';
            } else if (profile_admin === 'COORDINADOR' || profile_opera === 'SUPERVISOR' || profile_opera === 'JEFE DE GRUPO' || profile_opera === 'COORDINADOR GENERAL') {
                role = 'supervisor';
            }

            let dbMatch = dbUsers.find(u => normalize(u.name) === exName);
            if (!dbMatch && exCi) {
                // Solo si no lo encuentra por nombre, intenta por cédula
                dbMatch = dbUsers.find(u => u.cedula === exCi);
                if (dbMatch && normalize(dbMatch.name) !== exName) {
                    // Evitar actualizar el nombre si la cédula choca con otro usuario distinto
                    dbMatch = null; 
                }
            }

            const cleanStr = (str) => str.replace(/'/g, "''");

            if (dbMatch) {
                // Actualizar registro existente
                sqlCommands.push(`UPDATE users SET 
                    name='${cleanStr(exName)}', 
                    cedula='${cleanStr(exCi)}', 
                    email='${cleanStr(email)}', 
                    profile_admin='${cleanStr(profile_admin)}', 
                    profile_opera='${cleanStr(profile_opera)}', 
                    eye_id='${cleanStr(eye_id)}', 
                    phone='${cleanStr(phone)}', 
                    address='${cleanStr(address)}', 
                    sector='${cleanStr(sector)}', 
                    bank_name='${cleanStr(bank_name)}', 
                    bank_account='${cleanStr(bank_account)}', 
                    emergency_contact='${cleanStr(emergency_contact)}', 
                    emergency_phone='${cleanStr(emergency_phone)}', 
                    is_allergic='${cleanStr(is_allergic)}',
                    role='${role}',
                    is_active=1
                    WHERE id=${dbMatch.id};`);
            } else {
                // Crear nuevo registro
                const prefix = role === 'supervisor' ? 'P' : 'L';
                const suffix = exCi.length >= 3 ? exCi.slice(-3) : Math.floor(Math.random() * 900 + 100).toString();
                const pin = prefix + suffix;

                sqlCommands.push(`INSERT INTO users (
                    name, cedula, email, profile_admin, profile_opera, eye_id, phone, address, sector, 
                    bank_name, bank_account, emergency_contact, emergency_phone, is_allergic, 
                    role, is_active, pin_hash, created_at
                ) VALUES (
                    '${cleanStr(exName)}', '${cleanStr(exCi)}', '${cleanStr(email)}', '${cleanStr(profile_admin)}', 
                    '${cleanStr(profile_opera)}', '${cleanStr(eye_id)}', '${cleanStr(phone)}', '${cleanStr(address)}', 
                    '${cleanStr(sector)}', '${cleanStr(bank_name)}', '${cleanStr(bank_account)}', 
                    '${cleanStr(emergency_contact)}', '${cleanStr(emergency_phone)}', '${cleanStr(is_allergic)}', 
                    '${role}', 1, '${pin}', datetime('now')
                );`);
            }
        });

        if (sqlCommands.length > 0) {
            console.log(`Ejecutando ${sqlCommands.length} sentencias SQL en la base de datos...`);
            // Limpiar query de posibles saltos de línea extraños
            const cleanSql = sqlCommands.map(cmd => cmd.replace(/\n/g, ' '));
            
            const batchSize = 10;
            for (let i = 0; i < cleanSql.length; i += batchSize) {
                const batch = cleanSql.slice(i, i + batchSize).join(' ');
                console.log(`Procesando lote ${Math.floor(i/batchSize) + 1} de ${Math.ceil(cleanSql.length/batchSize)}...`);
                execSync(`npx wrangler d1 execute valet-db --remote -y --command="${batch.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
            }
            console.log('✅ Carga masiva completada exitosamente.');
        } else {
            console.log('⚠️ No hay registros válidos para actualizar/insertar.');
        }

    } catch (e) {
        console.error('❌ Error en el proceso:', e);
    }
}

sync();
