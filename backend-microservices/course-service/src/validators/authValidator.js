const Joi = require('joi');

const registerSchema = Joi.object({
  nom: Joi.string().min(3).max(255).required().messages({
    'string.empty': 'Le nom est obligatoire.',
    'string.min': 'Le nom doit contenir au moins 3 caractères.'
  }),
  telephone_whatsapp: Joi.string().pattern(/^[0-9]+$/).min(8).max(15).required().messages({
    'string.empty': 'Le numéro de téléphone est obligatoire.',
    'string.pattern.base': 'Le numéro de téléphone doit contenir uniquement des chiffres.'
  }),
  email: Joi.string().email().optional().allow(null, '').messages({
    'string.email': 'Veuillez fournir une adresse email valide.'
  }),
  mot_de_passe: Joi.string().min(6).required().messages({
    'string.empty': 'Le mot de passe est obligatoire.',
    'string.min': 'Le mot de passe doit contenir au moins 6 caractères.'
  }),
  ville: Joi.string().required().messages({
    'string.empty': 'La ville est obligatoire.'
  }),
  role: Joi.string().valid('CHAUFFEUR', 'ENTREPRISE', 'CHARGEUR').required().messages({
    'any.only': 'Le rôle doit être CHAUFFEUR, ENTREPRISE, ou CHARGEUR.'
  })
});

const loginSchema = Joi.object({
  telephone_whatsapp: Joi.string().required().messages({
    'string.empty': 'Le numéro de téléphone est obligatoire.'
  }),
  mot_de_passe: Joi.string().required().messages({
    'string.empty': 'Le mot de passe est obligatoire.'
  })
});

module.exports = {
  registerSchema,
  loginSchema
};
