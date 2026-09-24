// Bascule unique pour les identités de démonstration (demo-admin, demo-otp) et la restitution
// en clair du code OTP simulé. Aucune de ces identités n'effectue de vérification, et aucun SMS
// n'est jamais envoyé.
//
// Défaut différent selon l'environnement pour ne pas dépendre d'un opérateur qui penserait à
// positionner la variable : en développement/preview, activé par défaut (comportement actuel,
// changeable via ALLOW_DEMO_AUTH=false) ; en production réelle (NODE_ENV=production), désactivé
// par défaut — il faut explicitement positionner ALLOW_DEMO_AUTH=true pour le conserver.
export function isDemoAuthEnabled() {
  if (process.env.NODE_ENV === 'production') return process.env.ALLOW_DEMO_AUTH === 'true'
  return process.env.ALLOW_DEMO_AUTH !== 'false'
}
