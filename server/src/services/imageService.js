import { v2 as cloudinary } from "cloudinary";

export const uploadReportImage = (file) =>
  new Promise((resolve, reject) => {
    const config = {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    };
    const requiredConfig = ["cloud_name", "api_key", "api_secret"];
    if (requiredConfig.some((key) => !config[key])) {
      const error = new Error("Cloudinary image upload is not configured");
      error.statusCode = 503;
      error.publicMessage = "Photo uploads are unavailable because Cloudinary is not configured. Configure the Cloudinary values in server/.env, or submit the report without a photo.";
      reject(error);
      return;
    }
    cloudinary.config(config);
    const stream = cloudinary.uploader.upload_stream(
      { folder: "traceback/reports", resource_type: "image", allowed_formats: ["jpg", "jpeg", "png"] },
      (error, result) => {
        if (error) {
          const uploadError = new Error(`Cloudinary upload failed: ${error.message}`, { cause: error });
          uploadError.statusCode = 503;
          uploadError.publicMessage = "Cloudinary could not upload this photo. Check the Cloudinary credentials in server/.env and try again.";
          return reject(uploadError);
        }
        if (!result?.secure_url) {
          const uploadError = new Error("Cloudinary returned no secure image URL");
          uploadError.statusCode = 503;
          uploadError.publicMessage = "Cloudinary did not return an image URL. Please try uploading the photo again.";
          return reject(uploadError);
        }
        resolve(result.secure_url);
      }
    );
    stream.end(file.buffer);
  });
