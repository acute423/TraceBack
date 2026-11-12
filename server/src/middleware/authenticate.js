import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const authenticate = async (req, res, next) => {
  let payload;
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const token = authorization.slice(7);

    payload = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET,
      {
        algorithms: ["HS256"],
        issuer: "traceback-api",
        audience: "traceback-client",
      }
    );

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired access token",
    });
  }

  try {
    const user = await User.findOne({ _id: payload.sub, isActive: true }).select("role");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Account unavailable",
      });
    }
    req.auth = { userId: user._id.toString(), role: user.role };

    next();
  } catch (error) {
    return next(error);
  }
};
