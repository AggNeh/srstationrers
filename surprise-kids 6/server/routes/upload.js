const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const storage = require('../storage');

const router = express.Router();

const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;  // 50 MB raw upload; resized down on save

// Local dev fallback dir (only used when STORAGE_* env vars aren't set)
const LOCAL_DIR = path.join(__dirname, '..', '..', 'public', 'images', 'uploads');
if (!fs.existsSync(LOCAL_DIR)) fs.mkdirSync(LOCAL_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/|video\/)/.test(file.mimetype);
    cb(ok ? null : new Error('Only image or video files are allowed'), ok);
  },
});

function randomName(ext) {
  return crypto.randomBytes(12).toString('hex') + ext;
}

/**
 * POST /api/upload   (admin)   field name: "image"
 *   - Images: resized to max 1600px and re-encoded as WebP (~80% quality).
 *     SVGs pass through untouched.
 *   - Videos: up to 100 MB, passed through as-is.
 * Returns: { url, kind }
 */
router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const isVideo = req.file.mimetype.startsWith('video/');
    const isSvg = req.file.mimetype.includes('svg');
    const isImage = req.file.mimetype.startsWith('image/');

    let buffer = req.file.buffer;
    let contentType = req.file.mimetype;
    let ext = path.extname(req.file.originalname).toLowerCase();

    if (isVideo) {
      if (req.file.size > MAX_VIDEO_BYTES) {
        return res.status(413).json({ error: 'Video must be under 100 MB' });
      }
      if (!ext) ext = '.mp4';
    } else if (isImage && !isSvg) {
      if (req.file.size > MAX_IMAGE_BYTES) {
        return res.status(413).json({ error: 'Image too large (max 50 MB before processing)' });
      }
      try {
        // Resize to max 1600px on the longest side, strip EXIF, output webp.
        // This turns a 5 MB JPEG into ~200–400 KB without visible quality loss.
        buffer = await sharp(req.file.buffer)
          .rotate() // honour EXIF orientation, then strip it
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        contentType = 'image/webp';
        ext = '.webp';
      } catch (e) {
        return res.status(400).json({ error: 'Could not process image: ' + e.message });
      }
    } else if (isSvg) {
      if (!ext) ext = '.svg';
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const filename = randomName(ext);
    const folder = isVideo ? 'videos' : 'images';
    const key = `${folder}/${filename}`;

    let url;
    if (storage.isConfigured()) {
      url = await storage.uploadBuffer(key, buffer, contentType);
    } else {
      // Local dev fallback
      const localPath = path.join(LOCAL_DIR, filename);
      fs.writeFileSync(localPath, buffer);
      url = `/images/uploads/${filename}`;
    }

    res.status(201).json({ url, kind: isVideo ? 'video' : 'image' });
  } catch (err) { next(err); }
});

module.exports = router;
