import mysql from 'mysql2/promise';

async function checkDB() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'localhost',
      user: process.env.DATABASE_URL?.split('://')[1]?.split(':')[0] || 'root',
      password: process.env.DATABASE_URL?.split(':')[2]?.split('@')[0] || '',
      database: process.env.DATABASE_URL?.split('/')[3] || 'test',
    });

    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM phrases');
    console.log('Phrases in database:', rows[0].count);
    
    const [sample] = await connection.execute('SELECT * FROM phrases LIMIT 1');
    console.log('Sample phrase:', sample[0]);
    
    await connection.end();
  } catch (error) {
    console.error('Database error:', error.message);
  }
}

checkDB();
