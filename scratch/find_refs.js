
import { createClient } from '@libsql/client';

async function main() {
    const db = createClient({
        url: 'libsql://valet-db-smartgroupes.turso.io', // I don't have the URL but I can use wrangler
        authToken: '...'
    });
    // Actually I can't run this directly. I'll use wrangler.
}
