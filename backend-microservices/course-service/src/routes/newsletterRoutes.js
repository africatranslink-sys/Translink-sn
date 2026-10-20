const express = require('express');
const router = express.Router();
const newsletterController = require('../controllers/newsletterController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.use(verifyToken, verifyRole(['ADMIN']));
router.get('/audience', newsletterController.getAudience);
router.get('/campaigns', newsletterController.getCampaigns);
router.get('/campaigns/:id', newsletterController.getCampaign);
router.post('/campaigns', newsletterController.createCampaign);

module.exports = router;
