import { getDb } from './server/db.js';
import { phrases } from './drizzle/schema.js';
import { sql } from 'drizzle-orm';

async function checkPhrases() {
  const db = await getDb();
  if (!db) {
    console.log('Database not available');
    process.exit(1);
  }
  
  const count = await db.select({ count: sql`COUNT(*)` }).from(phrases);
  console.log('Total phrases:', count[0]?.count || 0);
  
  const sample = await db.select().from(phrases).limit(1);
  console.log('Sample phrase:', JSON.stringify(sample[0], null, 2));
}

checkPhrases().catch(console.error);
