const { AppError } = require('../utils/errors');
const { screenPhoto } = require('../utils/image-safety');

function createImageSafetyMiddleware(screen = screenPhoto) {
  return async function screenUploadedImages(req, _res, next) {
    const files = req.files || (req.file ? [req.file] : []);
    for (const file of files) {
      let result;
      try {
        result = await screen(file.buffer);
      } catch (error) {
        if (error instanceof AppError) throw error;
        console.error('Server-side image safety screening failed:', error);
        throw new AppError(
          503,
          'Image safety screening is temporarily unavailable. Please try uploading again later.',
          'IMAGE_SCREENING_UNAVAILABLE',
        );
      }

      if (!result?.safe) {
        throw new AppError(
          400,
          result?.reason || 'This photo was blocked by image safety screening.',
          'IMAGE_UNSAFE',
        );
      }
    }
    next();
  };
}

module.exports = {
  createImageSafetyMiddleware,
  screenUploadedImages: createImageSafetyMiddleware(),
};
