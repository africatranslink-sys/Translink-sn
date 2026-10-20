const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const negotiationController = require('../controllers/negotiationController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.post('/', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), courseController.createCourse);
router.get('/me', verifyToken, verifyRole(['CHARGEUR', 'CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), courseController.getMyCourses);
router.delete('/:id/cancel', verifyToken, verifyRole(['CHARGEUR']), negotiationController.cancelAcceptedCourse);
router.delete('/:id/decline', verifyToken, verifyRole(['CHAUFFEUR']), courseController.declineAssignedCourse);
router.get('/positions', verifyToken, courseController.getPositions);
router.post('/:id/position', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE']), courseController.publishPosition);
router.put('/:id/status', verifyToken, verifyRole(['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR']), courseController.updateCourseStatus);

module.exports = router;
