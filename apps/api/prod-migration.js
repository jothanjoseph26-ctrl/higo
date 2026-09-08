const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();
  
  try {
    console.log('=== RUNNING P0 MIGRATION ON PRODUCTION ===\n');
    
    // Step 1: Check if trips.city exists
    const tripsCity = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'city'");
    if (tripsCity.length > 0) {
      console.log('trips.city already exists — skipping');
    } else {
      console.log('Adding city column to trips...');
      await p.$executeRawUnsafe('ALTER TABLE trips ADD COLUMN city TEXT');
      console.log('✓ trips.city added');
    }
    
    // Step 2: Check if drivers.city exists
    const driversCity = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'city'");
    if (driversCity.length > 0) {
      console.log('drivers.city already exists — skipping');
    } else {
      console.log('Adding city column to drivers...');
      await p.$executeRawUnsafe('ALTER TABLE drivers ADD COLUMN city TEXT');
      console.log('✓ drivers.city added');
    }
    
    // Step 3: Check if drivers.state exists
    const driversState = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'state'");
    if (driversState.length > 0) {
      console.log('drivers.state already exists — skipping');
    } else {
      console.log('Adding state column to drivers...');
      await p.$executeRawUnsafe('ALTER TABLE drivers ADD COLUMN state TEXT');
      console.log('✓ drivers.state added');
    }
    
    // Step 4: Add indexes
    console.log('Creating drivers_city_idx...');
    await p.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS drivers_city_idx ON drivers(city)');
    console.log('✓ drivers_city_idx created');
    
    console.log('Creating trips_city_idx...');
    await p.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS trips_city_idx ON trips(city)');
    console.log('✓ trips_city_idx created');
    
    // Step 5: Verify
    console.log('\n=== VERIFICATION ===');
    const verifyTripsCity = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'city'");
    console.log('trips.city:', verifyTripsCity.length > 0 ? 'EXISTS ✓' : 'MISSING ✗');
    
    const verifyDriversCity = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'city'");
    console.log('drivers.city:', verifyDriversCity.length > 0 ? 'EXISTS ✓' : 'MISSING ✗');
    
    const verifyDriversState = await p.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'state'");
    console.log('drivers.state:', verifyDriversState.length > 0 ? 'EXISTS ✓' : 'MISSING ✗');
    
    const verifyDriversIdx = await p.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename = 'drivers' AND indexname = 'drivers_city_idx'");
    console.log('drivers_city_idx:', verifyDriversIdx.length > 0 ? 'EXISTS ✓' : 'MISSING ✗');
    
    const verifyTripsIdx = await p.$queryRawUnsafe("SELECT indexname FROM pg_indexes WHERE tablename = 'trips' AND indexname = 'trips_city_idx'");
    console.log('trips_city_idx:', verifyTripsIdx.length > 0 ? 'EXISTS ✓' : 'MISSING ✗');
    
    console.log('\n✅ PRODUCTION MIGRATION COMPLETE');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
}

main();
