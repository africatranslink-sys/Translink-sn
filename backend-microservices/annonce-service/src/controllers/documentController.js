const DocumentModel = require('../models/documentModel');

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni.' });
    }

    const { type_document } = req.body;
    if (!type_document) {
      return res.status(400).json({ error: 'Le type de document est requis.' });
    }

    const fichier_url = `/uploads/${req.file.filename}`;

    const newDocument = await DocumentModel.create({
      utilisateur_id: req.user.id,
      type_document,
      fichier_url
    });

    res.status(201).json({
      message: 'Document téléversé avec succès',
      document: newDocument
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors du téléversement du document' });
  }
};

const validateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body; // VALIDE ou REFUSE

    if (!['VALIDE', 'REFUSE'].includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }

    const updatedDocument = await DocumentModel.updateStatus(id, statut);
    if (!updatedDocument) {
      return res.status(404).json({ error: 'Document non trouvé.' });
    }

    res.json({
      message: `Document ${statut.toLowerCase()}`,
      document: updatedDocument
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la validation du document' });
  }
};

const getUserDocuments = async (req, res) => {
  try {
    const documents = await DocumentModel.findByUserId(req.user.id);
    res.json(documents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des documents' });
  }
};

module.exports = {
  uploadDocument,
  validateDocument,
  getUserDocuments
};
