const express = require("express");

const pushController = require("./push.controller");
const { authenticate, requirePasswordReady } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate, requirePasswordReady);

router.get("/vapid-public-key", pushController.getVapidPublicKey);
router.post("/subscriptions", pushController.saveSubscription);
router.delete("/subscriptions", pushController.deleteSubscription);

module.exports = router;
