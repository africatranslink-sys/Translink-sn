const MAX_SUBJECT_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 5000;

const validateCampaign = ({ subject, message }) => {
  if (typeof subject !== 'string' || !subject.trim()) {
    return 'L’objet du publipostage est obligatoire.';
  }
  if (subject.trim().length > MAX_SUBJECT_LENGTH) {
    return `L’objet ne peut pas dépasser ${MAX_SUBJECT_LENGTH} caractères.`;
  }
  if (/[\r\n]/.test(subject)) {
    return 'L’objet doit tenir sur une seule ligne.';
  }
  if (typeof message !== 'string' || !message.trim()) {
    return 'Le message du publipostage est obligatoire.';
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return `Le message ne peut pas dépasser ${MAX_MESSAGE_LENGTH} caractères.`;
  }
  return null;
};

module.exports = { MAX_SUBJECT_LENGTH, MAX_MESSAGE_LENGTH, validateCampaign };
