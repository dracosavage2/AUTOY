import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import { google } from "googleapis";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import * as admin from "firebase-admin";

dotenv.config();

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;
try {
  if (!admin.apps.length) {
    const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(firebaseConfigPath)) {
      const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));
      admin.initializeApp({
        projectId: config.projectId
      });
      console.log(`Firebase Admin inicializado com projectId: ${config.projectId}`);
      if (config.firestoreDatabaseId) {
        db = admin.firestore(config.firestoreDatabaseId);
        console.log(`Firestore usando databaseId: ${config.firestoreDatabaseId}`);
      }
    } else {
      admin.initializeApp();
      console.log("Firebase Admin inicializado com configuração padrão");
    }
  }
  if (!db) db = admin.firestore();
} catch (error) {
  console.error("Erro ao inicializar Firebase Admin:", error);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Trust proxy for secure cookies in iframe/proxy environments
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Setup session with SameSite=None and Secure=true for iframe
app.use(session({
  secret: "tubeauto-secret-123",
  resave: false,
  saveUninitialized: true,
  proxy: true,
  cookie: { 
    secure: true, 
    sameSite: "none" 
  }
}));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), dbInitialized: !!db });
});

// --- GALLERY ROUTES ---

app.get("/api/gallery", async (req, res) => {
  console.log("Gallery request received");
  if (!db) {
    console.error("Gallery request: db is null");
    return res.status(503).json({ error: "Serviço de galeria temporariamente indisponível (DB não inicializado)." });
  }
  try {
    const snapshot = await db.collection("videos")
      .orderBy("createdAt", "desc")
      .get();
    
    const videos = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? (data.createdAt as admin.firestore.Timestamp).toDate().toISOString() : null
      };
    });
    
    res.json(videos);
  } catch (error: any) {
    console.error("Erro ao buscar galeria:", error);
    res.status(500).json({ 
      error: "Erro ao buscar galeria.", 
      message: error.message,
      code: error.code
    });
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static('uploads'));

// Configure OAuth2 client
const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const rawAppUrl = process.env.APP_URL;
const appUrl = rawAppUrl ? rawAppUrl.replace(/\/$/, "") : undefined;

if (!clientId || !clientSecret || !appUrl) {
  console.warn("AVISO: Variáveis de ambiente GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ou APP_URL estão faltando.");
}

let oauth2Client: any = null;
if (clientId && clientSecret) {
  oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    appUrl ? `${appUrl}/auth/callback` : undefined
  );
} else {
  console.error("ERRO: OAuth2 Client não pôde ser inicializado - faltando credenciais.");
}

const upload = multer({ 
  dest: "uploads/",
  limits: { 
    fileSize: 1024 * 1024 * 1024, // 1GB for the video file
    fieldSize: 50 * 1024 * 1024   // 50MB for the thumbnail base64 and other fields
  }
});

// --- AUTH ROUTES ---

app.get("/api/auth/url", (req, res) => {
  try {
    if (!oauth2Client) {
      return res.status(500).json({ error: "Google OAuth2 Client não configurado no servidor. Verifique as credenciais no menu Settings." });
    }

    const scopes = [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly"
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent"
    });

    res.json({ url });
  } catch (error) {
    console.error("Erro ao gerar URL de auth:", error);
    res.status(500).json({ error: "Erro interno ao gerar URL de autenticação." });
  }
});

app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Código de autenticação ausente.");
  }
  if (!oauth2Client) {
    return res.status(500).send("OAuth2 Client não configurado.");
  }
  try {
    const { tokens } = await oauth2Client.getToken(code as string);
    // Store tokens in session
    (req.session as any).tokens = tokens;
    
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticação bem-sucedida! Esta janela fechará automaticamente.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Erro no callback do Google:", error);
    res.status(500).send("Erro na autenticação.");
  }
});

app.get("/api/auth/user", (req, res) => {
  const tokens = (req.session as any).tokens;
  if (!tokens) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true });
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// --- VIDEO ROUTES ---

app.post("/api/videos/direct-upload", (req, res, next) => {
  upload.single("video")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error("Multer error:", err);
      return res.status(400).json({ error: `Erro no upload (Multer): ${err.message}` });
    } else if (err) {
      console.error("Unknown upload error:", err);
      return res.status(500).json({ error: `Erro interno no upload: ${err.message}` });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      console.error("Direct Upload: req.file is missing");
      return res.status(400).json({ error: "Nenhum arquivo de vídeo foi recebido pelo servidor." });
    }
    
    const { title, description, tags, thumbnail } = req.body;
    console.log(`Direct Upload received: ${req.file.originalname} (${req.file.size} bytes)`);
    
    let thumbnailPath = "";

    if (thumbnail && thumbnail.startsWith("data:image")) {
      try {
        const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const thumbFileName = `thumb_${req.file.filename}.jpg`;
        const thumbFullDir = path.join(process.cwd(), "uploads");
        const thumbFullPath = path.join(thumbFullDir, thumbFileName);
        fs.writeFileSync(thumbFullPath, buffer);
        thumbnailPath = `/uploads/${thumbFileName}`;
      } catch (e: any) {
        console.error("Erro ao processar thumbnail:", e);
      }
    }

    if (!db) {
       console.error("Firestore DB not initialized");
       return res.status(503).json({ error: "Banco de dados Firebase não inicializado." });
    }

    const docRef = await db.collection("videos").add({
      title: title || req.file.originalname,
      description: description || "",
      tags: tags || "",
      thumbnailUrl: thumbnailPath, 
      localPath: `/uploads/${req.file.filename}`,
      userId: req.sessionID || "anonymous",
      status: 'local',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Video document created: ${docRef.id}`);
    res.json({ 
      id: docRef.id, 
      message: "Vídeo salvo na galeria local!", 
      localPath: `/uploads/${req.file.filename}`, 
      thumbnailPath 
    });
  } catch (error: any) {
    console.error("Erro fatal no direct-upload:", error);
    res.status(500).json({ error: "Erro interno ao processar e salvar o vídeo: " + error.message });
  }
});

// --- YOUTUBE ROUTES ---

app.post("/api/youtube/publish-existing", async (req, res) => {
  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: "videoId is required" });

  const tokens = (req.session as any).tokens;
  if (!tokens) return res.status(401).json({ error: "Por favor conecte sua conta do YouTube primeiro." });
  if (!oauth2Client) return res.status(500).json({ error: "Serviço YouTube não configurado." });

  if (!db) return res.status(503).json({ error: "Banco de dados indisponível." });

  try {
    const docRef = db.collection("videos").doc(videoId);
    const doc = await docRef.get();
    
    if (!doc.exists) return res.status(404).json({ error: "Vídeo não encontrado." });
    
    const videoData = doc.data()!;
    const localRelativePath = videoData.localPath;
    if (!localRelativePath) return res.status(400).json({ error: "Arquivo de vídeo local não encontrado para este registro." });

    const absolutePath = path.join(process.cwd(), localRelativePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: "O arquivo de vídeo físico foi removido do servidor." });
    }

    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Upload to YouTube
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: videoData.title || "AutoStudio Video",
          description: videoData.description || "Enviado via AutoStudio",
          tags: videoData.tags ? videoData.tags.split(",").map((t: string) => t.trim()) : [],
          categoryId: "22"
        },
        status: {
          privacyStatus: "unlisted" // Default to unlisted for safety
        }
      },
      media: {
        body: fs.createReadStream(absolutePath)
      }
    });

    const ytData: any = response.data;

    // Update Firestore record
    await docRef.update({
      youtubeId: ytData.id,
      status: 'published',
      publishedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Handle Thumbnail if video record has a local thumb
    if (videoData.thumbnailUrl && videoData.thumbnailUrl.startsWith('/uploads/')) {
      try {
        const thumbAbsolutePath = path.join(process.cwd(), videoData.thumbnailUrl);
        if (fs.existsSync(thumbAbsolutePath)) {
           await youtube.thumbnails.set({
            videoId: ytData.id,
            media: {
              mimeType: 'image/jpeg',
              body: fs.createReadStream(thumbAbsolutePath),
            },
          });
        }
      } catch (thumbError) {
        console.error("Erro ao sincronizar thumbnail no YT:", thumbError);
      }
    }

    res.json({ 
      success: true, 
      youtubeId: ytData.id, 
      message: "Publicado com sucesso no YouTube!" 
    });

  } catch (error: any) {
    console.error("Erro na publicação para YouTube:", error);
    res.status(500).json({ error: "Erro ao publicar no YouTube: " + (error.message || "Erro desconhecido") });
  }
});

app.get("/api/youtube/videos", async (req, res) => {
  const tokens = (req.session as any).tokens;
  if (!tokens) return res.status(401).send("Unauthorized");
  if (!oauth2Client) return res.status(500).send("OAuth2 Client not configured");

  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    const response = await youtube.search.list({
      part: ["snippet"],
      forMine: true,
      type: ["video"],
      maxResults: 10
    });
    res.json(response.data.items);
  } catch (error) {
    console.error("Erro ao buscar vídeos do YouTube:", error);
    res.status(500).send("Erro ao buscar vídeos.");
  }
});

app.post("/api/youtube/upload", upload.single("video"), async (req, res) => {
  const tokens = (req.session as any).tokens;
  if (!tokens) return res.status(401).json({ error: "Unauthorized - Por favor conecte ao YouTube" });
  if (!oauth2Client) return res.status(500).json({ error: "OAuth2 Client not configured" });

  const { title, description, tags, privacyStatus, thumbnail } = req.body;
  const videoFile = req.file;

  if (!videoFile) return res.status(400).send("Nenhum vídeo enviado.");

  oauth2Client.setCredentials(tokens);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title || "AutoStudio Video",
          description: description || "Uploaded via AutoStudio",
          tags: tags ? tags.split(",").map((t: string) => t.trim()) : [],
          categoryId: "22"
        },
        status: {
          privacyStatus: privacyStatus || "private"
        }
      },
      media: {
        body: fs.createReadStream(videoFile.path)
      }
    });

    const ytData: any = response.data;

    // Handle Thumbnail if provided as base64
    if (thumbnail && thumbnail.startsWith("data:image") && ytData.id) {
      try {
        const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const thumbDir = path.join(process.cwd(), "temp_thumbs");
        if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
        const thumbPath = path.join(thumbDir, `yt_${ytData.id}.jpg`);
        fs.writeFileSync(thumbPath, buffer);

        await youtube.thumbnails.set({
          videoId: ytData.id,
          media: {
            mimeType: 'image/jpeg',
            body: fs.createReadStream(thumbPath),
          },
        });
        fs.unlinkSync(thumbPath);
      } catch (thumbError) {
        console.error("YT Thumbnail Error:", thumbError);
      }
    }
    
    // Save to Firestore Gallery using sessionID as userId
    if (db) {
      try {
        await db.collection("videos").add({
          title: ytData.snippet.title,
          description: ytData.snippet.description,
          youtubeId: ytData.id,
          thumbnailUrl: ytData.snippet?.thumbnails?.high?.url || ytData.snippet?.thumbnails?.medium?.url || '',
          userId: req.sessionID,
          status: 'published',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } catch (dbError) {
        console.error("Erro ao salvar no Firestore:", dbError);
      }
    }

    if (videoFile && fs.existsSync(videoFile.path)) fs.unlinkSync(videoFile.path);
    res.json(response.data);
  } catch (error) {
    console.error("Erro no upload do YouTube:", error);
    if (videoFile && fs.existsSync(videoFile.path)) fs.unlinkSync(videoFile.path);
    res.status(500).json({ error: "Erro no upload para o YouTube." });
  }
});

// JSON fallback for any missing API routes to prevent HTML leakage
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: `O ponto final de API ${req.originalUrl} não foi encontrado.` });
});

// --- VITE MIDDLEWARE ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
