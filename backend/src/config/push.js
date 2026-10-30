const logger = require("../utils/logger");

const publicKey = process.env.VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

const enabled = Boolean(publicKey && privateKey);

if (!enabled) {
  logger.warn("Web Push disabled: missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY");
}

module.exports = {
  enabled,
  publicKey,
  privateKey,
  subject,
};
