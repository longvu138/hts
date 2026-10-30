const router = require('express').Router();
const {
  authenticate,
  requirePasswordReady
} = require('../../middlewares/auth.middleware');
const c = require('./work.controller');
router.use(authenticate, requirePasswordReady);
router.post('/work-assignments/availability', c.availability);
router.get('/work-assignments/recipients', c.recipients);
router.get('/work-assignments', c.list);
router.post('/work-assignments', c.create);
router.get('/work-assignments/:workId', c.detail);
router.patch('/work-assignments/:workId', c.updateInfo);
router.patch('/work-parts/:assignmentId', c.edit);
router.post('/work-parts/:assignmentId/transfer', c.transfer);
router.post('/work-parts/:assignmentId/complete', c.complete);
router.post('/work-parts/:assignmentId/cancel', c.cancel);
router.get('/work-schedule/departments', c.departments);
router.get('/work-schedule', c.schedule);
module.exports = router;
