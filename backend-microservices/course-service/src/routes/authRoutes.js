const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');
const validateRequest = require('../middlewares/validateRequest');
const { registerSchema, loginSchema } = require('../validators/authValidator');

router.post('/register', validateRequest(registerSchema), authController.register);
router.post('/login', validateRequest(loginSchema), authController.login);
router.get('/profile', verifyToken, authController.getProfile);

module.exports = router;
