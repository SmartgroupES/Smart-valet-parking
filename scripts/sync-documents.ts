import fs from 'fs';
import path from 'path';

const API_URL = 'https://eye-staff.app/api/admin/sync-documents'; // Update to local URL if testing locally
const JWT_SECRET = 'p8X3mA9qL7sT2vB4yZ6rN1kF0wH9cQ5d'; // Needs to match the env JWT_SECRET

async function runSync() {
    console.log("🚀 Iniciando sincronización de documentos con Cloudflare AI OCR...");
    let totalProcessed = 0;
    let consecutiveFails = 0;
    
    while (true) {
        console.log("⏱️  Procesando lote...");
        let attempt = 0;
        let success = false;
        let lastError = '';
        
        while (attempt < 3 && !success) {
            attempt++;
            try {
                const res = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${JWT_SECRET}`
                    }
                });
                
                if (res.status === 503 || res.status === 524) {
                    lastError = `HTTP ${res.status}`;
                    console.log(`  ⚠️  Intento ${attempt}/3 falló (${lastError}), reintentando en 3s...`);
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                
                if (!res.ok) {
                    const text = await res.text();
                    console.error("❌ Error en la petición HTTP:", res.status, text.substring(0, 100));
                    break;
                }
                
                const data = await res.json() as any;
                
                if (data.processed === 0 || data.message === 'No more documents to process') {
                    console.log("✅ Proceso completado. Ya no quedan documentos pendientes.");
                    totalProcessed += 0;
                    success = true;
                    return; // Exit the outer while loop
                }
                
                totalProcessed += data.processed;
                console.log(`✅ Lote completado: ${data.processed} documentos extraídos. (Total: ${totalProcessed})`);
                success = true;
            } catch (err: any) {
                lastError = err.message;
                console.log(`  ⚠️  Intento ${attempt}/3 error de red: ${err.message}, reintentando...`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
        
        if (!success) {
            console.log(`  ⏭️  Saltando este lote tras 3 intentos fallidos (${lastError})`);
            consecutiveFails++;
            if (consecutiveFails >= 5) {
                console.log("❌ Demasiados fallos consecutivos, abortando.");
                break;
            }
        } else {
            consecutiveFails = 0;
        }
        
        // Wait 2 seconds between batches to avoid Cloudflare rate limiting or CPU timeouts
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log(`🏁 Resumen: ${totalProcessed} empleados actualizados en total.`);
}

runSync();
