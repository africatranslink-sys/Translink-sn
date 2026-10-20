const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.post('/', verifyToken, verifyRole(['CHARGEUR', 'ADMIN']), courseController.createCourse);
router.put('/:id/status', verifyToken, verifyRole(['CHARGEUR', 'CHAUFFEUR', 'ENTREPRISE', 'ADMIN']), courseController.updateCourseStatus);

module.exports = router;
