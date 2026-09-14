import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const uploadDir = path.resolve("./uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({ storage });

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado." });
  }

  res.json({
    message: "Arquivo enviado com sucesso.",
    filename: req.file.filename,
    originalName: req.file.originalname,
  });
});

app.get("/api/uploads", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Erro ao listar uploads." });
    }
    res.json({ files });
  });
});

app.get("/api/galeria", (req, res) => {
  const galeriaDir = path.join(__dirname, "public", "galeria");
  fs.readdir(galeriaDir, { withFileTypes: true }, async (err, entries) => {
    if (err) {
      return res.status(500).json({ error: "Erro ao listar galeria." });
    }

    try {
      const dirents = entries || [];
      const folders = dirents.filter((d) => d.isDirectory()).map((d) => d.name);

      const imageRegex = /\.(jpg|jpeg|png|webp|gif)$/i;

      const events = [];

      // Process folders as events
      for (let i = 0; i < folders.length; i++) {
        const folder = folders[i];
        const folderPath = path.join(galeriaDir, folder);
        const files = fs.readdirSync(folderPath);
        const imagesInFolder = files.filter((f) => imageRegex.test(f)).map((f) => `${folder}/${f}`);

        // Try to load event metadata from event.json
        let metadata = {};
        const metaPath = path.join(folderPath, "event.json");
        if (fs.existsSync(metaPath)) {
          try {
            const raw = fs.readFileSync(metaPath, "utf8");
            metadata = JSON.parse(raw || "{}");
          } catch (e) {
            console.warn(`Erro lendo metadata em ${metaPath}:`, e.message);
          }
        }

        events.push({
          id: `event-${folder}`,
          folder,
          cover: metadata.cover ? `${folder}/${metadata.cover}` : (imagesInFolder[0] || null),
          date: metadata.date || null,
          description: metadata.description || null,
          images: imagesInFolder,
        });
      }

      // Sort events by date descending (most recent first)
      events.sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return b.date.localeCompare(a.date);
      });

      // Backwards compatibility: provide a flat `images` array with covers of top 6 events
      const flatImages = events.slice(0, 6).map((evt, idx) => ({
        id: `cover-${idx}`,
        filename: evt.cover,
        label: `Foto ${idx + 1}`,
      })).filter((img) => img.filename);

      res.json({ events, images: flatImages });
    } catch (e) {
      console.error("Erro processando galeria:", e);
      res.status(500).json({ error: "Erro ao processar galeria." });
    }
  });
});
// Endpoint to verify YouTube video availability via oEmbed
app.get('/api/youtube/oembed', async (req, res) => {
  const videoId = req.query.videoId;
  if (!videoId) return res.status(400).json({ ok: false, error: 'missing videoId' });

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(
      videoId
    )}&format=json`;
    const r = await fetch(oembedUrl);
    if (!r.ok) {
      return res.json({ ok: false, error: 'video not found' });
    }
    const json = await r.json();
    return res.json({ ok: true, ...json });
  } catch (e) {
    console.warn('youtube oembed error', e.message);
    return res.json({ ok: false, error: e.message });
  }
});

app.use(express.static(path.join(__dirname, "public")));


app.use("/uploads", express.static(uploadDir));

const port = 5000;
app.listen(port, () => {
  console.log(`Upload server running on http://localhost:${port}`);
});
