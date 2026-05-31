// Use native fetch

const samples = [
    { name: "NELSON CARRILLO", address: "Calle Francisco Santos 29 2 A, Madrid, Españao, 28028", sector: "Madrid" },
    { name: "JOSÉ GREGORIO RAMOS", address: "Casa 64, Km 9 de la Panamericana, Sector El Puente,Los Teques", sector: "Los Teques" },
    { name: "NICOLÁS BETANCOURT", address: "Calle el colegio ,Residencias el naranjal,Los Samanes", sector: "Los Samanes" },
    { name: "VADYN TINOCO", address: "Edif. Irpinia, Piso 1, Apto. 3. Av. Buenos Aires,Los Caobos", sector: "Los Caobos" },
    { name: "GUSTAVO ORTIZ", address: "Edif. Puerto Escondido, Piso 3, Apto. 31,Catia La Mar", sector: "Catia La Mar" },
    { name: "PEDRO MALAVÉ", address: "Bloque 42, Piso 12, Apto. 1206, Zona F,23 de enero", sector: "23 de enero" },
    { name: "JOSÉ PIMENTEL", address: "Casa 115, Calle Principal de Maca,Maca, Petare", sector: "Maca, Petare" },
    { name: "DELVIN SUAREZ", address: "Casa \"Mi sueño\" #9, Calle 1, Terrazas de Vista Linda,Santa Teresa Tuy", sector: "Santa Teresa Tuy" },
    { name: "JAVIER LEÓN", address: "Edif. Ina, Piso 22, Apto. 229, Calle Venus,La Candelaria", sector: "La Candelaria" },
    { name: "NICOLÁS CABALLERO", address: "Edif. Leopardi, PB, Apto. 2, Av. Cecilio Acosta,San Bernardino", sector: "San Bernardino" }
];

function cleanAddress(address) {
    let cleaned = address
        .replace(/Edif\.\s+[^,]+/gi, '')
        .replace(/Edificio\s+[^,]+/gi, '')
        .replace(/Res\.\s+[^,]+/gi, '')
        .replace(/Residencias\s+[^,]+/gi, '')
        .replace(/Bloque\s+\d+/gi, '')
        .replace(/Casa\s+["']?[a-zA-Z0-9_-]+["']?/gi, '')
        .replace(/Casa\s+\d+/gi, '')
        .replace(/Piso\s+\d+/gi, '')
        .replace(/Apto\.\s+\d+/gi, '')
        .replace(/Apto\s+\d+/gi, '')
        .replace(/Apartamento\s+\d+/gi, '')
        .replace(/Local\s+\d+/gi, '')
        .replace(/Km\s+\d+/gi, '')
        .replace(/#/gi, '')
        .replace(/,\s*,+/g, ',')
        .trim();
    cleaned = cleaned.replace(/^,|,$/g, '').trim();
    return cleaned;
}

async function geocode(address, sector) {
    const queriesToTry = [];
    const cleaned = cleanAddress(address);
    if (cleaned && cleaned.length > 5) {
        queriesToTry.push(`${cleaned}, ${sector || ''}, Venezuela`);
        queriesToTry.push(`${cleaned}, Venezuela`);
    }
    const parts = address.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        const prevPart = parts[parts.length - 2];
        queriesToTry.push(`${prevPart}, ${lastPart}, Venezuela`);
    }
    if (sector) {
        const sec = sector.trim();
        if (sec.toLowerCase().includes('teques') || sec.toLowerCase().includes('guaira') || sec.toLowerCase().includes('catia')) {
            queriesToTry.push(`${sec}, Venezuela`);
        } else {
            queriesToTry.push(`${sec}, Caracas, Venezuela`);
            queriesToTry.push(`${sec}, Venezuela`);
        }
    }

    for (const q of queriesToTry) {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
        try {
            const r = await fetch(url, { headers: { 'Accept-Language': 'es', 'User-Agent': 'Test/1.0' } });
            const data = await r.json();
            if (data && data[0]) {
                return { success: true, query: q, lat: data[0].lat, lon: data[0].lon };
            }
        } catch (e) {
            console.error(e);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return { success: false };
}

async function main() {
    for (const s of samples) {
        console.log(`Geocodificando a ${s.name}...`);
        const res = await geocode(s.address, s.sector);
        console.log(`Resultado:`, res);
        console.log('------------------------------------');
    }
}

main();
