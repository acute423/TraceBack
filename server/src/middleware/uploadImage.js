import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (req, file, callback) => {
    const allowed = new Set(["image/jpeg", "image/png"]);
    if (!allowed.has(file.mimetype)) {
      const error = new Error("Only JPG and PNG images are allowed");
      error.statusCode = 400;
      return callback(error);
    }
    callback(null, true);
  },
});

export const reportImage = (req, res, next) => {
  upload.fields([{ name: "photos", maxCount: 3 }, { name: "image", maxCount: 3 }])(req, res, (error) => {
    if (error) {
      error.statusCode = error.code === "LIMIT_FILE_SIZE" ? 413 : (error.statusCode || 400);
      return next(error);
    }
    const files = [...(req.files?.photos || []), ...(req.files?.image || [])];
    const maximum = req.baseUrl.endsWith("/found") ? 1 : 3;
    if (files.length > maximum) {
      const tooMany = new Error(`A ${req.baseUrl.endsWith("/found") ? "found" : "lost"} report allows at most ${maximum} photo${maximum === 1 ? "" : "s"}`);
      tooMany.statusCode = 400;
      return next(tooMany);
    }
    for (const file of files) {
      const name = file.originalname.toLowerCase();
      const isJpeg = file.mimetype === "image/jpeg"
        && /\.(jpe?g)$/.test(name)
        && file.buffer[0] === 0xff
        && file.buffer[1] === 0xd8
        && file.buffer[2] === 0xff;
      const isPng = file.mimetype === "image/png"
        && name.endsWith(".png")
        && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!isJpeg && !isPng) {
        const invalidImage = new Error("Image content must be a valid JPG or PNG file");
        invalidImage.statusCode = 400;
        return next(invalidImage);
      }
    }
    req.reportImages = files;
    next();
  });
};
