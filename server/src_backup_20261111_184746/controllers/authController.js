import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
  getRefreshCookieOptions,
} from "../services/tokenService.js";

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: "user",
    });

    return res.status(201).json({
      success: true,
      message: "Account registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);

    await RefreshToken.create({
      user: user._id,
      tokenHash,
      familyId: crypto.randomUUID(),
      expiresAt: getRefreshTokenExpiry(),
    });

    res.cookie(
      "refreshToken",
      refreshToken,
      getRefreshCookieOptions()
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refreshSession = async (req, res, next) => {
  try {
    const rawToken = req.cookies?.refreshToken;

    if (!rawToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token missing",
      });
    }

    const tokenHash = hashRefreshToken(rawToken);
    const storedToken = await RefreshToken.findOne({ tokenHash });

    if (!storedToken) {
      res.clearCookie("refreshToken", getRefreshCookieOptions());

      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // Detect reuse of an already-revoked token.
    if (storedToken.revokedAt) {
      await RefreshToken.updateMany(
        {
          familyId: storedToken.familyId,
          revokedAt: null,
        },
        {
          $set: { revokedAt: new Date() },
        }
      );

      res.clearCookie("refreshToken", getRefreshCookieOptions());

      return res.status(401).json({
        success: false,
        message: "Refresh token reuse detected. Please log in again.",
      });
    }

    if (storedToken.expiresAt <= new Date()) {
      res.clearCookie("refreshToken", getRefreshCookieOptions());

      return res.status(401).json({
        success: false,
        message: "Refresh token expired",
      });
    }

    const user = await User.findById(storedToken.user);

    if (!user || !user.isActive) {
      await RefreshToken.updateMany(
        { familyId: storedToken.familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );

      res.clearCookie("refreshToken", getRefreshCookieOptions());

      return res.status(401).json({
        success: false,
        message: "Account unavailable",
      });
    }

    const newRawToken = createRefreshToken();
    const newTokenHash = hashRefreshToken(newRawToken);
    const now = new Date();

    // Atomically consume the old token. This also prevents
    // two simultaneous refresh requests from both succeeding.
    const rotatedToken = await RefreshToken.findOneAndUpdate(
      {
        _id: storedToken._id,
        revokedAt: null,
        expiresAt: { $gt: now },
      },
      {
        $set: {
          revokedAt: now,
          replacedByTokenHash: newTokenHash,
        },
      },
      { new: true }
    );

    if (!rotatedToken) {
      await RefreshToken.updateMany(
        { familyId: storedToken.familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );

      res.clearCookie("refreshToken", getRefreshCookieOptions());

      return res.status(401).json({
        success: false,
        message: "Refresh token is no longer valid",
      });
    }

    await RefreshToken.create({
      user: user._id,
      tokenHash: newTokenHash,
      familyId: storedToken.familyId,
      expiresAt: getRefreshTokenExpiry(),
    });

    res.cookie(
      "refreshToken",
      newRawToken,
      getRefreshCookieOptions()
    );

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
      accessToken: createAccessToken(user),
    });
  } catch (error) {
    next(error);
  }
};
