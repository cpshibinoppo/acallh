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

// Initialize database tables if they don't exist
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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS voice_statements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL,
        time TIME NOT NULL,
        number VARCHAR(20) NOT NULL,
        duration_sec INT NOT NULL,
        amount_rs VARCHAR(20) NOT NULL,
        UNIQUE KEY unique_voice (date, time)
      )
    `);
    console.log('Voice statements table ensured.');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS recharge_statements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date DATE NOT NULL,
        time TIME NOT NULL,
        amount_rs VARCHAR(20) NOT NULL,
        channel VARCHAR(255) NOT NULL,
        UNIQUE KEY unique_recharge (date, time)
      )
    `);
    console.log('Recharge statements table ensured.');

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

// Endpoint to upload parsed PDF statements
app.post('/api/statements/upload', async (req, res) => {
  const { voice, recharge } = req.body;

  if (!Array.isArray(voice) || !Array.isArray(recharge)) {
    return res.status(400).json({ error: 'Voice and recharge arrays are required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Insert voice records
    if (voice.length > 0) {
      // Map date from 'DD-MM-YYYY' to 'YYYY-MM-DD'
      const voiceValues = voice.map(item => {
        const [day, month, year] = item.date.split('-');
        const formattedDate = `${year}-${month}-${day}`;
        return [
          formattedDate,
          item.time,
          item.number,
          parseInt(item.durationSec, 10) || 0,
          item.amountRs
        ];
      });

      // Insert or replace voice statements
      const voiceQuery = `
        INSERT INTO voice_statements (date, time, number, duration_sec, amount_rs)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          number = VALUES(number),
          duration_sec = VALUES(duration_sec),
          amount_rs = VALUES(amount_rs)
      `;
      await connection.query(voiceQuery, [voiceValues]);
    }

    // Insert recharge records
    if (recharge.length > 0) {
      // Map date from 'DD-MM-YYYY' to 'YYYY-MM-DD'
      const rechargeValues = recharge.map(item => {
        const [day, month, year] = item.date.split('-');
        const formattedDate = `${year}-${month}-${day}`;
        // Format time to HH:mm:00 if it is HH:mm
        let formattedTime = item.time;
        if (formattedTime.split(':').length === 2) {
          formattedTime = `${formattedTime}:00`;
        }
        return [
          formattedDate,
          formattedTime,
          item.amountRs,
          item.channel
        ];
      });

      // Insert or replace recharge statements
      const rechargeQuery = `
        INSERT INTO recharge_statements (date, time, amount_rs, channel)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          amount_rs = VALUES(amount_rs),
          channel = VALUES(channel)
      `;
      await connection.query(rechargeQuery, [rechargeValues]);
    }

    await connection.commit();
    res.json({ success: true, message: 'Statements uploaded and saved successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error uploading statements:', error);
    res.status(500).json({ error: 'Failed to upload statements to database: ' + error.message });
  } finally {
    connection.release();
  }
});

// Endpoint to fetch statements with date filtering
app.get('/api/statements', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let voiceQuery = `
      SELECT 
        DATE_FORMAT(date, '%d-%m-%Y') as date, 
        TIME_FORMAT(time, '%H:%i:%s') as time, 
        number, 
        duration_sec as durationSec, 
        amount_rs as amountRs 
      FROM voice_statements
    `;
    let rechargeQuery = `
      SELECT 
        DATE_FORMAT(date, '%d-%m-%Y') as date, 
        TIME_FORMAT(time, '%H:%i') as time, 
        amount_rs as amountRs, 
        channel 
      FROM recharge_statements
    `;

    const voiceParams = [];
    const rechargeParams = [];
    const conditions = [];

    if (startDate) {
      conditions.push('date >= ?');
      voiceParams.push(startDate);
      rechargeParams.push(startDate);
    }
    if (endDate) {
      conditions.push('date <= ?');
      voiceParams.push(endDate);
      rechargeParams.push(endDate);
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      voiceQuery += whereClause;
      rechargeQuery += whereClause;
    }

    voiceQuery += ' ORDER BY voice_statements.date ASC, voice_statements.time ASC';
    rechargeQuery += ' ORDER BY recharge_statements.date ASC, recharge_statements.time ASC';

    const [voiceRows] = await pool.query(voiceQuery, voiceParams);
    const [rechargeRows] = await pool.query(rechargeQuery, rechargeParams);

    // Map sNo for tables
    const voice = voiceRows.map((row, index) => ({
      sNo: String(index + 1),
      date: row.date,
      time: row.time,
      number: row.number,
      durationSec: String(row.durationSec),
      amountRs: row.amountRs
    }));

    const recharge = rechargeRows.map((row, index) => ({
      sNo: String(index + 1),
      date: row.date,
      time: row.time,
      amountRs: row.amountRs,
      channel: row.channel
    }));

    res.json({ voice, recharge });
  } catch (error) {
    console.error('Error fetching statements:', error);
    res.status(500).json({ error: 'Failed to fetch statements' });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
