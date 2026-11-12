export const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || "Internal server error";

  if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Database validation failed";
  }

  if (error.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource identifier";
  }

  if (error.code === 11000) {
    statusCode = 409;
    message = "A record with this value already exists";
  }

  if (error.name === "ZodError") {
    statusCode = 400;
    message = "Request validation failed";
  }

  if (statusCode >= 500) {
    message = error.publicMessage || "Internal server error";
  }

  res.status(statusCode).json({
    success: false,
    message,
  });
};
