import Notification from "../models/Notification.js";

export const listNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.auth.userId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, notifications });
  } catch (error) {
    next(error);
  }
};

export const markNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.auth.userId },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
    res.json({ success: true, notification });
  } catch (error) {
    next(error);
  }
};
