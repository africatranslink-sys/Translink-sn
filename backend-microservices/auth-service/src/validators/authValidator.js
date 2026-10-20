const Joi = require('joi');

const registerSchema = Joi.object({
  nom: Joi.string().min(3).max(255).required().messages({
    'string.empty': 'Le nom est obligatoire.',
    'string.min': 'Le nom doit contenir au moins 3 caractères.'
  }),
  telephone_whatsapp: Joi.string().pattern(/^\+?[0-9\s-]+$/).min(8).max(20).required().messages({
    'string.empty': 'Le numéro de téléphone est obligatoire.',
    'string.pattern.base': 'Le numéro de téléphone contient des caractères invalides.'
  }),
  email: Joi.string().email().required().messages({
    'string.empty': 'L’adresse e-mail est obligatoire pour recevoir les notifications de compte.',
    'string.email': 'Veuillez fournir une adresse email valide.'
  }),
  mot_de_passe: Joi.string().min(6).required().messages({
    'string.empty': 'Le mot de passe est obligatoire.',
    'string.min': 'Le mot de passe doit contenir au moins 6 caractères.'
  }),
  ville: Joi.string().required().messages({
    'string.empty': 'La ville est obligatoire.'
  }),
  numero_cni_nin: Joi.string().trim().min(5).max(50).pattern(/^[A-Za-z0-9/\s-]+$/).required().messages({
    'string.empty': 'Le numéro CNI/NIN est obligatoire.',
    'string.min': 'Le numéro CNI/NIN doit contenir au moins 5 caractères.',
    'string.pattern.base': 'Le numéro CNI/NIN contient des caractères invalides.'
  }),
  role: Joi.string().valid('CHAUFFEUR', 'ENTREPRISE', 'CHARGEUR', 'TRANSPORTEUR').required().messages({
    'any.only': 'Le rôle sélectionné est invalide.'
  }),
  newsletter_consent: Joi.boolean()
});

const loginSchema = Joi.object({
  identifiant: Joi.string().required().messages({
    'string.empty': 'L’email ou le numéro de téléphone est obligatoire.'
  }),
  mot_de_passe: Joi.string().required().messages({
    'string.empty': 'Le mot de passe est obligatoire.'
  })
});

module.exports = {
  registerSchema,
  loginSchema
};
