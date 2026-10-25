import multer from 'multer';
import { allowedImageTypes } from '../utils/storage/index.js';
import { ValidationError } from '../utils/errors/index.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return cb(new ValidationError({ message: 'Only jpg, png, webp and gif images are allowed' }));
    }
    cb(null, true);
  },
});

export const uploadProductImages = upload.array('images', 5);
export const uploadCategoryImage = upload.single('image');
