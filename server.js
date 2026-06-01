import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Database connection configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '2923!2923',
  database: 'acallh_db',
};

// Create a connection pool
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Initialize database table if it doesn't exist
async function initDb() {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to MySQL database.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        number VARCHAR(20) PRIMARY KEY,
        name VARCHAR(255)
      )
    `);
    console.log('Contacts table ensured.');
    connection.release();
  } catch (error) {
    console.error('Error connecting to or initializing database:', error);
  }
}

initDb();

// Endpoint to fetch names for a list of numbers
app.post('/api/contacts/lookup', async (req, res) => {
  try {
    const { numbers } = req.body;
    
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.json({ contacts: {} });
    }

    const placeholders = numbers.map(() => '?').join(',');
    const query = `SELECT number, name FROM contacts WHERE number IN (${placeholders})`;
    
    const [rows] = await pool.query(query, numbers);
    
    const contacts = {};
    rows.forEach(row => {
      contacts[row.number] = row.name;
    });

    res.json({ contacts });
  } catch (error) {
    console.error('Error in lookup endpoint:', error);
    res.status(500).json({ error: 'Failed to look up contacts' });
  }
});

// Endpoint to update or insert a contact name
app.post('/api/contacts', async (req, res) => {
  try {
    const { number, name } = req.body;
    
    if (!number || !name) {
      return res.status(400).json({ error: 'Number and name are required' });
    }

    const query = `
      INSERT INTO contacts (number, name) 
      VALUES (?, ?) 
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `;
    
    await pool.query(query, [number, name]);
    
    res.json({ success: true, message: 'Contact updated successfully' });
  } catch (error) {
    console.error('Error in update endpoint:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
