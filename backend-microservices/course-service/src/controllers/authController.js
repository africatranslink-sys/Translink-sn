const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');

const register = async (req, res) => {
  try {
    const { nom, telephone_whatsapp, email, mot_de_passe, ville, role } = req.body;

    // Check if user exists
    const existingUser = await UserModel.findByTelephone(telephone_whatsapp);
    if (existingUser) {
      return res.status(400).json({ error: 'Ce numéro WhatsApp est déjà utilisé.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(mot_de_passe, salt);

    // Create user
    const newUser = await UserModel.create({
      nom,
      telephone_whatsapp,
      email,
      mot_de_passe: hashedPassword,
      ville,
      role
    });

    res.status(201).json({
      message: 'Utilisateur créé avec succès. En attente de vérification des documents.',
      user: newUser
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'utilisateur' });
  }
};

const login = async (req, res) => {
  try {
    const { telephone_whatsapp, mot_de_passe } = req.body;

    // Check if user exists
    const user = await UserModel.findByTelephone(telephone_whatsapp);
    if (!user) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!isMatch) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }

    // Create JWT
    const payload = {
      id: user.id,
      role: user.role,
      statut_verification: user.statut_verification
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user.id,
        nom: user.nom,
        role: user.role,
        statut_verification: user.statut_verification
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
};

module.exports = {
  register,
  login,
  getProfile
};
