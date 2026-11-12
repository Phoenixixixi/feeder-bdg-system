import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import { INITIAL_SCHEDULES } from './src/data/scheduleData.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://mhammaddustin_db_user:%21Rusdi19@cluster0.nkb8oon.mongodb.net/feeder-bdg?retryWrites=true&w=majority';
const DB_NAME = process.env.MONGODB_DB_NAME || 'feeder-bdg';

const app = express();

// High limits for handling base64 MP3 audio uploads reliably
app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ limit: '60mb', extended: true }));

// MongoDB Connection
let mongoClient: MongoClient | null = null;
let db: any = null;

async function getDb() {
  if (!db) {
    mongoClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 8000,
    });
    await mongoClient.connect();
    db = mongoClient.db(DB_NAME);
    console.log(`[MongoDB] Connected successfully to ${DB_NAME}`);
    await autoSeedIfNeeded(db);
  }
  return db;
}

async function autoSeedIfNeeded(database: any) {
  try {
    const schedulesColl = database.collection('schedules');
    const count = await schedulesColl.countDocuments();
    if (count === 0) {
      console.log('[MongoDB] Seeding 31 initial feeder schedules...');
      const docs = INITIAL_SCHEDULES.map((s) => ({
        ...s,
        _id: s.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      await schedulesColl.insertMany(docs);
      console.log('[MongoDB] Seed completed successfully.');
    }

    const settingsColl = database.collection('settings');
    const settingsDoc = await settingsColl.findOne({ _id: 'pids_config' });
    if (!settingsDoc) {
      await settingsColl.insertOne({
        _id: 'pids_config',
        gateAnimationEnabled: false,
        universalPreOpenUrl: '',
        universalPreOpenFileName: null,
        universalPreOpenEnUrl: '',
        universalPreOpenEnFileName: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log('[MongoDB] Default settings initialized.');
    }
  } catch (err) {
    console.error('[MongoDB] Error in autoSeedIfNeeded:', err);
  }
}

// ======================== API ROUTES ========================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const database = await getDb();
    res.json({
      status: 'ok',
      database: DB_NAME,
      time: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET all schedules
app.get('/api/schedules', async (req, res) => {
  try {
    const database = await getDb();
    const schedulesColl = database.collection('schedules');
    // Fetch all documents without MongoDB in-memory 32MB sort limitation
    const items = await schedulesColl.find({}).toArray();

    // Sort cleanly in Node.js JavaScript (31 items, 0ms, zero memory limit)
    items.sort((a: any, b: any) => (a.tripIndex ?? 0) - (b.tripIndex ?? 0));

    // Map _id to id and ensure lightweight payload (< 50KB)
    // Full audio data is securely fetched on-demand from /api/audio/:key and cached in IndexedDB
    const sanitized = items.map((item: any) => {
      const { _id, ...rest } = item;
      const cleanDoc = { ...rest, id: _id };

      const stripIfHuge = (url: any) => (typeof url === 'string' && url.length > 50000 ? '' : url);

      cleanDoc.audioPreOpenUrl = stripIfHuge(cleanDoc.audioPreOpenUrl);
      cleanDoc.audioGateOpenUrl = stripIfHuge(cleanDoc.audioGateOpenUrl);
      cleanDoc.audioClosingUrl = stripIfHuge(cleanDoc.audioClosingUrl);
      cleanDoc.audioUrl = stripIfHuge(cleanDoc.audioUrl);
      cleanDoc.audioPreOpenEnUrl = stripIfHuge(cleanDoc.audioPreOpenEnUrl);
      cleanDoc.audioGateOpenEnUrl = stripIfHuge(cleanDoc.audioGateOpenEnUrl);
      cleanDoc.audioClosingEnUrl = stripIfHuge(cleanDoc.audioClosingEnUrl);
      cleanDoc.audioEnUrl = stripIfHuge(cleanDoc.audioEnUrl);

      if (Array.isArray(cleanDoc.customAudioAlerts)) {
        cleanDoc.customAudioAlerts = cleanDoc.customAudioAlerts.map((ca: any) => ({
          ...ca,
          audioUrl: stripIfHuge(ca.audioUrl),
          audioEnUrl: stripIfHuge(ca.audioEnUrl),
        }));
      }

      return cleanDoc;
    });

    res.json(sanitized);
  } catch (err: any) {
    console.error('Error fetching schedules:', err);
    res.status(500).json({ error: 'Failed to fetch schedules: ' + err.message });
  }
});

// UPDATE single schedule
app.put('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const database = await getDb();
    const schedulesColl = database.collection('schedules');

    const cleanUpdates = { ...updates };
    delete cleanUpdates._id;
    cleanUpdates.id = id;
    cleanUpdates.updatedAt = new Date().toISOString();

    await schedulesColl.updateOne(
      { _id: id },
      { $set: cleanUpdates },
      { upsert: true }
    );

    const updated = await schedulesColl.findOne({ _id: id });
    if (updated) {
      const { _id, ...rest } = updated;
      res.json({ id: _id, ...rest });
    } else {
      res.json({ id, ...cleanUpdates });
    }
  } catch (err: any) {
    console.error('Error updating schedule:', err);
    res.status(500).json({ error: 'Failed to update schedule: ' + err.message });
  }
});

// DELETE schedule
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await getDb();
    const schedulesColl = database.collection('schedules');
    const audioColl = database.collection('audio_files');

    await schedulesColl.deleteOne({ _id: id });
    await audioColl.deleteMany({ scheduleId: id });

    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete schedule: ' + err.message });
  }
});

// CLEAR ALL AUDIOS from all schedules
app.post('/api/schedules/clear-audios', async (req, res) => {
  try {
    const database = await getDb();
    const schedulesColl = database.collection('schedules');
    const audioColl = database.collection('audio_files');

    await schedulesColl.updateMany(
      {},
      {
        $set: {
          audioUrl: '',
          audioFileName: null,
          audioPreOpenUrl: '',
          audioPreOpenFileName: null,
          audioGateOpenUrl: '',
          audioGateOpenFileName: null,
          audioClosingUrl: '',
          audioClosingFileName: null,
          audioEnUrl: '',
          audioEnFileName: null,
          audioPreOpenEnUrl: '',
          audioPreOpenEnFileName: null,
          audioGateOpenEnUrl: '',
          audioGateOpenEnFileName: null,
          audioClosingEnUrl: '',
          audioClosingEnFileName: null,
          customAudioAlerts: [],
          updatedAt: new Date().toISOString(),
        },
      }
    );

    await audioColl.deleteMany({});
    res.json({ success: true, message: 'All schedule audios cleared' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear audios: ' + err.message });
  }
});

// RESET schedules to default
app.post('/api/schedules/reset', async (req, res) => {
  try {
    const database = await getDb();
    const schedulesColl = database.collection('schedules');
    await schedulesColl.deleteMany({});

    const docs = INITIAL_SCHEDULES.map((s) => ({
      ...s,
      _id: s.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    await schedulesColl.insertMany(docs);

    res.json({ message: 'Schedules reset to defaults', count: docs.length });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset schedules: ' + err.message });
  }
});

// GET settings
app.get('/api/settings', async (req, res) => {
  try {
    const database = await getDb();
    const settingsColl = database.collection('settings');
    const settings = await settingsColl.findOne({ _id: 'pids_config' });

    if (settings) {
      const { _id, ...rest } = settings;
      res.json(rest);
    } else {
      res.json({
        gateAnimationEnabled: false,
        universalPreOpenUrl: '',
        universalPreOpenFileName: null,
        universalPreOpenEnUrl: '',
        universalPreOpenEnFileName: null,
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch settings: ' + err.message });
  }
});

// UPDATE settings
app.put('/api/settings', async (req, res) => {
  try {
    const updates = req.body;
    const database = await getDb();
    const settingsColl = database.collection('settings');

    const clean = { ...updates };
    delete clean._id;
    clean.updatedAt = new Date().toISOString();

    await settingsColl.updateOne(
      { _id: 'pids_config' },
      { $set: clean },
      { upsert: true }
    );

    const updated = await settingsColl.findOne({ _id: 'pids_config' });
    const { _id, ...rest } = updated || {};
    res.json(rest || clean);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update settings: ' + err.message });
  }
});

// SAVE audio (Single document up to 16MB in MongoDB Atlas!)
app.post('/api/audio', async (req, res) => {
  try {
    const { key, scheduleId, slot, lang, fileName, dataUrl, aliasFor } = req.body;
    if (!key) {
      return res.status(400).json({ error: 'Audio key is required' });
    }

    const database = await getDb();
    const audioColl = database.collection('audio_files');

    const now = new Date().toISOString();
    const record = {
      _id: key,
      key,
      scheduleId: scheduleId || '',
      slot: slot || '',
      lang: lang || 'id',
      fileName: fileName || '',
      dataUrl: dataUrl || '',
      aliasFor: aliasFor || null,
      updatedAt: now,
    };

    await audioColl.updateOne({ _id: key }, { $set: record }, { upsert: true });

    res.json({
      success: true,
      key,
      fileName,
      size: dataUrl ? dataUrl.length : 0,
      updatedAt: now,
    });
  } catch (err: any) {
    console.error('Error saving audio to MongoDB:', err);
    res.status(500).json({ error: 'Failed to save audio: ' + err.message });
  }
});

// GET audio by key
app.get('/api/audio/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const database = await getDb();
    const audioColl = database.collection('audio_files');

    const record = await audioColl.findOne({ _id: key });
    if (!record) {
      return res.status(404).json({ error: 'Audio not found' });
    }

    // If alias, follow pointer
    if (record.aliasFor && record.aliasFor !== key) {
      const target = await audioColl.findOne({ _id: record.aliasFor });
      if (target) {
        return res.json({
          key: target.key,
          fileName: target.fileName,
          dataUrl: target.dataUrl,
          updatedAt: target.updatedAt,
        });
      }
    }

    res.json({
      key: record.key,
      fileName: record.fileName,
      dataUrl: record.dataUrl,
      updatedAt: record.updatedAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch audio: ' + err.message });
  }
});

// GET all audio metadata (without bulky dataUrl)
app.get('/api/audio', async (req, res) => {
  try {
    const database = await getDb();
    const audioColl = database.collection('audio_files');
    const records = await audioColl
      .find({}, { projection: { dataUrl: 0 } })
      .toArray();

    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch audio list: ' + err.message });
  }
});

// DELETE audio by key
app.delete('/api/audio/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const database = await getDb();
    const audioColl = database.collection('audio_files');

    await audioColl.deleteOne({ _id: key });
    res.json({ success: true, deletedKey: key });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete audio: ' + err.message });
  }
});

// ======================== FRONTEND INTEGRATION ========================

const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    // Development mode with Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Listen immediately on PORT so Cloud Run startup probe succeeds without waiting on DB network
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Full-stack KA Feeder listening on http://0.0.0.0:${PORT}`);
  });

  // Connect to MongoDB asynchronously after port is open
  getDb().catch((connErr: any) => {
    console.error('[MongoDB] Initial connection warning:', connErr.message);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
});
