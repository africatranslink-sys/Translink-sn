const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const uploadDir = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const allowedMimeTypes = new Map([
  ['application/pdf', new Set(['.pdf'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
]);

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const extensionsForMimeType = allowedMimeTypes.get(file.mimetype);
    if (extensionsForMimeType?.has(extension)) {
      return cb(null, true);
    }
    cb(new Error('Format non pris en charge. Utilisez une image JPEG, PNG ou WebP.'));
  }
});

module.exports = upload;
