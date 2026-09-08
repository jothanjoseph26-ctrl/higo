const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  
  try {
    console.log('=== PRODUCTION DATABASE INSPECTION ===\n');
    
    // 1. Check _prisma_migrations
    console.log('--- _prisma_migrations (applied migrations) ---');
    const migrations = await p.$queryRawUnsafe(`
      SELECT migration_name, finished_at, checksum
      FROM _prisma_migrations
      ORDER BY finished_at ASC
    `);
    console.log(`Total applied: ${migrations.length}`);
    migrations.forEach(m => {
      const name = m.migration_name || '(unnamed)';
      const status = m.finished_at ? 'APPLIED' : 'PENDING';
      console.log(`  ${name} | ${status} | ${m.finished_at || 'N/A'}`);
    });
    
    // 2. Check if P0 migration is applied
    const p0Applied = migrations.find(m => m.migration_name && m.migration_name.includes('p0_add_city_filter'));
    console.log(`\nP0 migration applied: ${p0Applied ? 'YES' : 'NO'}`);
    
    // 3. Check if trips.city exists
    console.log('\n--- Schema Check ---');
    const tripsCity = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'city'");
    console.log(`trips.city: ${tripsCity.length > 0 ? 'EXISTS' : 'MISSING'}`);
    
    const driversCity = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'city'");
    console.log(`drivers.city: ${driversCity.length > 0 ? 'EXISTS' : 'MISSING'}`);
    
    const driversState = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'state'");
    console.log(`drivers.state: ${driversState.length > 0 ? 'EXISTS' : 'MISSING'}`);
    
    // 4. Check indexes
    const driversIdx = await p.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename = 'drivers' AND indexname = 'drivers_city_idx'");
    console.log(`drivers_city_idx: ${driversIdx.length > 0 ? 'EXISTS' : 'MISSING'}`);
    
    const tripsIdx = await p.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename = 'trips' AND indexname = 'trips_city_idx'");
    console.log(`trips_city_idx: ${tripsIdx.length > 0 ? 'EXISTS' : 'MISSING'}`);
    
    // 5. Check if whatsapp tables exist
    const whatsappConfig = await p.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_name = 'whatsapp_config'");
    console.log(`whatsapp_config table: ${whatsappConfig.length > 0 ? 'EXISTS' : 'MISSING'}`);
    
    const whatsappConversations = await p.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_name = 'whatsapp_conversations'");
    console.log(`whatsapp_conversations table: ${whatsappConversations.length > 0 ? 'EXISTS' : 'MISSING'}`);
    
    // 6. Check for missing migration files
    console.log('\n--- Missing Migration Check ---');
    const migrationNames = migrations.map(m => m.migration_name).filter(Boolean);
    console.log(`Applied migration names: ${migrationNames.join(', ')}`);
    
    console.log('\n✅ Inspection complete');
  } catch (e) {
    console.error('Inspection failed:', e.message);
  } finally {
    await p.$disconnect();
  }
}

main();
