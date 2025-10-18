import fs from "fs";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "german_phrases",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function seed() {
  const connection = await pool.getConnection();
  try {
    const phrases = JSON.parse(fs.readFileSync("./quality_phrases.json", "utf-8"));
    
    console.log(`Clearing existing phrases...`);
    await connection.execute("DELETE FROM phrases");
    
    console.log(`Seeding ${phrases.length} quality phrases...`);
    
    for (let i = 0; i < phrases.length; i += 100) {
      const batch = phrases.slice(i, i + 100);
      for (const p of batch) {
        await connection.execute(
          "INSERT INTO phrases (id, german, english, category, difficulty) VALUES (?, ?, ?, ?, ?)",
          [p.id, p.german, p.english, p.category, p.difficulty || "intermediate"]
        );
      }
      console.log(`Inserted ${Math.min(i + 100, phrases.length)} of ${phrases.length}`);
    }
    
    console.log("Seeding complete!");
  } finally {
    await connection.end();
    await pool.end();
  }
}

seed().catch(console.error);
