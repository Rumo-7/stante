const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const TIPOS_PERMITIDOS = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const sufixo = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${sufixo}${path.extname(file.originalname)}`);
  },
});

const multerUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Envie apenas PDF ou DOCX.'));
    }
  },
});

function uploadAnexos(req, res, next) {
  multerUpload.array('anexos')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ erro: err.message });
    }
    next();
  });
}

module.exports = { uploadAnexos, UPLOAD_DIR };
