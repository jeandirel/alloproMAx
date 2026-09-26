export interface Professional {
  id: string
  name: string
  metier: string
  categorie: string
  zone: string
  note: number
  /** Nombre d'avis réels derrière `note`. 0 = pas encore d'avis (à ne pas afficher comme une note). */
  ratingCount?: number
  missions: number
  tarifMin: number
  verifie: boolean
  enLigne: boolean
  photo: string
  bio: string
  tauxReponse: number | null
  delaiMoyen: string | null
  disponibilite: string
  zones: string[]
  services: { nom: string; tarif: number }[]
  galerie: string[]
  avis: { nom: string; photo: string; note: number; date: string; commentaire: string; quartier: string }[]
  /** Numéro de contact réel, si renseigné par le professionnel. Absent = pas de bouton d'appel. */
  phone?: string | null
  // Champs additionnels utilisés uniquement par les fiches réelles (issues de
  // la base de données) pour les filtres par identifiant dans /recherche.
  cityId?: string | null
  neighborhoodId?: string | null
  neighborhoodIds?: string[]
  serviceIds?: string[]
}

const professionalData: Professional[] = [
  {
    id: '1',
    name: 'Jean-Baptiste Moussavou',
    metier: 'Plombier',
    categorie: 'Plomberie',
    zone: 'Akanda',
    note: 4.9,
    missions: 127,
    tarifMin: 8000,
    verifie: true,
    enLigne: true,
    photo: 'https://randomuser.me/api/portraits/men/32.jpg',
    bio: 'Plombier professionnel avec 8 ans d\'expérience à Libreville. Spécialisé en installations sanitaires, réparations de fuites et débouchage de canalisations.',
    tauxReponse: 98,
    delaiMoyen: '~30 min',
    disponibilite: 'Disponible maintenant',
    zones: ['Akanda', 'Libreville Centre', 'Owendo'],
    services: [
      { nom: 'Réparation de fuite', tarif: 8000 },
      { nom: 'Débouchage canalisation', tarif: 12000 },
      { nom: 'Installation sanitaire', tarif: 25000 },
      { nom: 'Remplacement robinetterie', tarif: 15000 },
    ],
    galerie: [
      'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400&h=300&fit=crop',
      '/galeries-v2/sanitaire.webp',
    ],
    avis: [
      { nom: 'Alain Mboula', photo: 'https://randomuser.me/api/portraits/men/45.jpg', note: 5, date: '12 sept. 2025', commentaire: 'Travail impeccable, rapide et professionnel. Je recommande vivement !', quartier: 'Akanda' },
      { nom: 'Sylvie Nzé', photo: 'https://randomuser.me/api/portraits/women/28.jpg', note: 5, date: '5 sept. 2025', commentaire: 'Très réactif et compétent. La fuite a été réparée en moins d\'une heure.', quartier: 'Libreville Centre' },
      { nom: 'Patrick Obiang', photo: 'https://randomuser.me/api/portraits/men/51.jpg', note: 4, date: '28 août 2025', commentaire: 'Bon travail, un peu de retard mais résultat satisfaisant.', quartier: 'Owendo' },
    ],
  },
  {
    id: '2',
    name: 'Marie-Claire Obame',
    metier: 'Agent de ménage',
    categorie: 'Ménage',
    zone: 'Owendo',
    note: 4.8,
    missions: 94,
    tarifMin: 5000,
    verifie: true,
    enLigne: true,
    photo: 'https://randomuser.me/api/portraits/women/44.jpg',
    bio: 'Professionnelle du ménage et de l\'entretien à domicile. Services de nettoyage complet, repassage et organisation d\'intérieur.',
    tauxReponse: 95,
    delaiMoyen: '~45 min',
    disponibilite: 'Disponible maintenant',
    zones: ['Owendo', 'Libreville Centre'],
    services: [
      { nom: 'Ménage complet (appartement)', tarif: 5000 },
      { nom: 'Ménage complet (maison)', tarif: 10000 },
      { nom: 'Repassage', tarif: 3000 },
      { nom: 'Grand nettoyage', tarif: 15000 },
    ],
    galerie: [
      'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1527515545081-5db817172677?w=400&h=300&fit=crop',
    ],
    avis: [
      { nom: 'Marthe Essono', photo: 'https://randomuser.me/api/portraits/women/33.jpg', note: 5, date: '10 sept. 2025', commentaire: 'Marie-Claire est fantastique. Ma maison n\'a jamais été aussi propre !', quartier: 'Owendo' },
      { nom: 'Joseph Ntoutoume', photo: 'https://randomuser.me/api/portraits/men/22.jpg', note: 5, date: '1 sept. 2025', commentaire: 'Ponctuelle, soigneuse et agréable. Service 5 étoiles.', quartier: 'Libreville Centre' },
      { nom: 'Élodie Minko', photo: 'https://randomuser.me/api/portraits/women/41.jpg', note: 4, date: '20 août 2025', commentaire: 'Très bon travail dans l\'ensemble, je recommande.', quartier: 'Owendo' },
    ],
  },
  {
    id: '3',
    name: 'Paul Nzamba',
    metier: 'Électricien',
    categorie: 'Électricité',
    zone: 'Libreville Centre',
    note: 4.7,
    missions: 203,
    tarifMin: 12000,
    verifie: true,
    enLigne: true,
    photo: 'https://randomuser.me/api/portraits/men/36.jpg',
    bio: 'Électricien certifié avec plus de 10 ans d\'expérience. Installations, dépannages et mises aux normes électriques pour particuliers et professionnels.',
    tauxReponse: 92,
    delaiMoyen: '~40 min',
    disponibilite: 'Disponible maintenant',
    zones: ['Libreville Centre', 'Akanda', 'PK5'],
    services: [
      { nom: 'Dépannage électrique', tarif: 12000 },
      { nom: 'Installation prise/interrupteur', tarif: 8000 },
      { nom: 'Tableau électrique', tarif: 35000 },
      { nom: 'Éclairage extérieur', tarif: 20000 },
    ],
    galerie: [
      'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1555664424-778a1e5e1b48?w=400&h=300&fit=crop',
    ],
    avis: [
      { nom: 'Bernard Ndong', photo: 'https://randomuser.me/api/portraits/men/55.jpg', note: 5, date: '8 sept. 2025', commentaire: 'Paul est un vrai professionnel. Installation propre et soignée.', quartier: 'Libreville Centre' },
      { nom: 'Rose Anguile', photo: 'https://randomuser.me/api/portraits/women/52.jpg', note: 4, date: '25 août 2025', commentaire: 'Bon service, a résolu le problème rapidement.', quartier: 'PK5' },
      { nom: 'Didier Moukagni', photo: 'https://randomuser.me/api/portraits/men/29.jpg', note: 5, date: '15 août 2025', commentaire: 'Très satisfait de l\'intervention. Tarifs corrects.', quartier: 'Akanda' },
    ],
  },
  {
    id: '4',
    name: 'Sandrine Mboumba',
    metier: 'Coiffeuse / Beauté',
    categorie: 'Beauté & Bien-être',
    zone: 'PK5',
    note: 4.9,
    missions: 311,
    tarifMin: 3500,
    verifie: true,
    enLigne: true,
    photo: 'https://randomuser.me/api/portraits/women/68.jpg',
    bio: 'Coiffeuse et esthéticienne passionnée. Spécialisée en coiffures africaines, soins capillaires, manucure et maquillage à domicile.',
    tauxReponse: 99,
    delaiMoyen: '~20 min',
    disponibilite: 'Disponible maintenant',
    zones: ['PK5', 'PK8', 'Nzeng-Ayong', 'Libreville Centre'],
    services: [
      { nom: 'Tresses et nattes', tarif: 3500 },
      { nom: 'Coiffure événementielle', tarif: 8000 },
      { nom: 'Manucure/Pédicure', tarif: 5000 },
      { nom: 'Maquillage professionnel', tarif: 10000 },
    ],
    galerie: [
      'https://images.unsplash.com/photo-1562322140-8baeececf3df?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=300&fit=crop',
    ],
    avis: [
      { nom: 'Carine Obame', photo: 'https://randomuser.me/api/portraits/women/35.jpg', note: 5, date: '14 sept. 2025', commentaire: 'Sandrine est une artiste ! Mes tresses sont magnifiques.', quartier: 'PK5' },
      { nom: 'Nadia Lemba', photo: 'https://randomuser.me/api/portraits/women/48.jpg', note: 5, date: '7 sept. 2025', commentaire: 'Maquillage sublime pour mon mariage. Merci Sandrine !', quartier: 'Nzeng-Ayong' },
      { nom: 'Félicia Nang', photo: 'https://randomuser.me/api/portraits/women/19.jpg', note: 5, date: '29 août 2025', commentaire: 'La meilleure coiffeuse de Libreville. Service impeccable.', quartier: 'PK8' },
    ],
  },
  {
    id: '5',
    name: 'Rodrigue Ondo',
    metier: 'Mécanicien auto',
    categorie: 'Mécanique auto',
    zone: 'PK8',
    note: 4.6,
    missions: 78,
    tarifMin: 15000,
    verifie: true,
    enLigne: false,
    photo: 'https://randomuser.me/api/portraits/men/75.jpg',
    bio: 'Mécanicien automobile avec 12 ans d\'expérience. Diagnostic, réparation et entretien de tous types de véhicules.',
    tauxReponse: 88,
    delaiMoyen: '~60 min',
    disponibilite: 'Disponible demain',
    zones: ['PK8', 'PK5', 'Owendo'],
    services: [
      { nom: 'Diagnostic moteur', tarif: 15000 },
      { nom: 'Vidange + filtres', tarif: 20000 },
      { nom: 'Freins (remplacement)', tarif: 25000 },
      { nom: 'Climatisation auto', tarif: 18000 },
    ],
    galerie: [
      'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?w=400&h=300&fit=crop',
    ],
    avis: [
      { nom: 'Serge Bibang', photo: 'https://randomuser.me/api/portraits/men/62.jpg', note: 5, date: '3 sept. 2025', commentaire: 'Excellent mécanicien, honnête et compétent.', quartier: 'PK8' },
      { nom: 'Lydie Asseko', photo: 'https://randomuser.me/api/portraits/women/56.jpg', note: 4, date: '22 août 2025', commentaire: 'Bon diagnostic, ma voiture marche comme neuve.', quartier: 'PK5' },
    ],
  },
  {
    id: '6',
    name: 'Christelle Nguema',
    metier: 'Technicienne clim',
    categorie: 'Climatisation',
    zone: 'Nzeng-Ayong',
    note: 4.8,
    missions: 56,
    tarifMin: 20000,
    verifie: true,
    enLigne: true,
    photo: 'https://randomuser.me/api/portraits/women/72.jpg',
    bio: 'Technicienne en climatisation et froid. Installation, entretien et dépannage de climatiseurs toutes marques.',
    tauxReponse: 94,
    delaiMoyen: '~45 min',
    disponibilite: 'Disponible maintenant',
    zones: ['Nzeng-Ayong', 'PK5', 'PK8', 'Libreville Centre'],
    services: [
      { nom: 'Installation climatiseur', tarif: 25000 },
      { nom: 'Entretien / Nettoyage', tarif: 12000 },
      { nom: 'Dépannage / Réparation', tarif: 20000 },
      { nom: 'Recharge gaz', tarif: 15000 },
    ],
    galerie: [
      '/galeries-v2/climatisation.webp',
    ],
    avis: [
      { nom: 'Thierry Mba', photo: 'https://randomuser.me/api/portraits/men/38.jpg', note: 5, date: '11 sept. 2025', commentaire: 'Christelle est très compétente. Clim réparée en 1h.', quartier: 'Nzeng-Ayong' },
      { nom: 'Aude Nzoghe', photo: 'https://randomuser.me/api/portraits/women/64.jpg', note: 5, date: '2 sept. 2025', commentaire: 'Professionnelle et efficace, je la recommande.', quartier: 'PK5' },
    ],
  },
  {
    id: '7',
    name: 'Étienne Boundou',
    metier: 'Chauffeur/Transport',
    categorie: 'Transport',
    zone: 'Libreville Centre',
    note: 4.7,
    missions: 445,
    tarifMin: 5000,
    verifie: true,
    enLigne: true,
    photo: 'https://randomuser.me/api/portraits/men/85.jpg',
    bio: 'Chauffeur privé et transporteur à Libreville. Courses en ville, transferts aéroport et déménagements.',
    tauxReponse: 97,
    delaiMoyen: '~15 min',
    disponibilite: 'Disponible maintenant',
    zones: ['Libreville Centre', 'Akanda', 'Owendo', 'Aéroport'],
    services: [
      { nom: 'Course en ville', tarif: 5000 },
      { nom: 'Transfert aéroport', tarif: 15000 },
      { nom: 'Déménagement (petit)', tarif: 30000 },
      { nom: 'Location journée', tarif: 50000 },
    ],
    galerie: [
      '/galeries-v2/transport.webp',
    ],
    avis: [
      { nom: 'Ghislain Engonga', photo: 'https://randomuser.me/api/portraits/men/42.jpg', note: 5, date: '15 sept. 2025', commentaire: 'Étienne est ponctuel et son véhicule est très propre.', quartier: 'Libreville Centre' },
      { nom: 'Viviane Bekale', photo: 'https://randomuser.me/api/portraits/women/31.jpg', note: 4, date: '8 sept. 2025', commentaire: 'Bon service pour le transfert aéroport. Merci !', quartier: 'Akanda' },
    ],
  },
  {
    id: '8',
    name: 'Joëlle Mba',
    metier: 'Tutrice scolaire',
    categorie: 'Tutorat',
    zone: 'Akanda',
    note: 4.9,
    missions: 88,
    tarifMin: 7500,
    verifie: true,
    enLigne: true,
    photo: 'https://randomuser.me/api/portraits/women/79.jpg',
    bio: 'Enseignante diplômée proposant des cours de soutien scolaire en maths, français et sciences pour élèves du primaire et du collège.',
    tauxReponse: 96,
    delaiMoyen: '~1h',
    disponibilite: 'Disponible maintenant',
    zones: ['Akanda', 'Libreville Centre'],
    services: [
      { nom: 'Cours de maths (1h)', tarif: 7500 },
      { nom: 'Cours de français (1h)', tarif: 7500 },
      { nom: 'Aide aux devoirs (2h)', tarif: 10000 },
      { nom: 'Préparation examens', tarif: 15000 },
    ],
    galerie: [
      'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=300&fit=crop',
    ],
    avis: [
      { nom: 'Alice Mouele', photo: 'https://randomuser.me/api/portraits/women/26.jpg', note: 5, date: '13 sept. 2025', commentaire: 'Mon fils a beaucoup progressé grâce à Joëlle. Excellente pédagogue.', quartier: 'Akanda' },
      { nom: 'Roger Obone', photo: 'https://randomuser.me/api/portraits/men/48.jpg', note: 5, date: '6 sept. 2025', commentaire: 'Cours clairs et adaptés au niveau de ma fille. Merci !', quartier: 'Libreville Centre' },
    ],
  },
  {
    id: '9',
    name: 'Franck Assoumou',
    metier: 'Plombier/Sanitaire',
    categorie: 'Plomberie',
    zone: 'Owendo',
    note: 4.5,
    missions: 62,
    tarifMin: 9000,
    verifie: true,
    enLigne: false,
    photo: 'https://randomuser.me/api/portraits/men/91.jpg',
    bio: 'Plombier sanitaire expérimenté. Spécialiste en installation de chauffe-eau, réparation WC et tuyauterie.',
    tauxReponse: 85,
    delaiMoyen: '~50 min',
    disponibilite: 'Disponible demain',
    zones: ['Owendo', 'PK8'],
    services: [
      { nom: 'Installation chauffe-eau', tarif: 20000 },
      { nom: 'Réparation WC', tarif: 9000 },
      { nom: 'Tuyauterie', tarif: 15000 },
    ],
    galerie: [],
    avis: [
      { nom: 'Henri Emane', photo: 'https://randomuser.me/api/portraits/men/66.jpg', note: 4, date: '30 août 2025', commentaire: 'Travail correct, je referai appel à lui.', quartier: 'Owendo' },
    ],
  },
  {
    id: '10',
    name: 'Amélie Koumba',
    metier: 'Agent de ménage',
    categorie: 'Ménage',
    zone: 'Libreville Centre',
    note: 4.7,
    missions: 143,
    tarifMin: 4500,
    verifie: true,
    enLigne: true,
    photo: 'https://randomuser.me/api/portraits/women/82.jpg',
    bio: 'Spécialiste du ménage résidentiel et professionnel. Nettoyage approfondi, vitres et entretien régulier.',
    tauxReponse: 93,
    delaiMoyen: '~35 min',
    disponibilite: 'Disponible maintenant',
    zones: ['Libreville Centre', 'Akanda', 'Nzeng-Ayong'],
    services: [
      { nom: 'Ménage standard', tarif: 4500 },
      { nom: 'Nettoyage vitres', tarif: 6000 },
      { nom: 'Ménage bureau/local', tarif: 8000 },
      { nom: 'Nettoyage après travaux', tarif: 20000 },
    ],
    galerie: [
      'https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=400&h=300&fit=crop',
    ],
    avis: [
      { nom: 'Laetitia Ongama', photo: 'https://randomuser.me/api/portraits/women/39.jpg', note: 5, date: '9 sept. 2025', commentaire: 'Amélie est très consciencieuse. Résultat impeccable.', quartier: 'Libreville Centre' },
      { nom: 'Stéphane Mbia', photo: 'https://randomuser.me/api/portraits/men/34.jpg', note: 4, date: '25 août 2025', commentaire: 'Bon rapport qualité-prix, service fiable.', quartier: 'Akanda' },
    ],
  },
]

// Portraits illustratifs générés pour des profils entièrement fictifs.
export const professionals: Professional[] = professionalData.map(p => ({ ...p, photo: `/portraits-v2/pro-${p.id}.webp` }))

export const categories = [
  { id: 'plomberie', nom: 'Plomberie', icon: 'Wrench' as const },
  { id: 'electricite', nom: 'Électricité', icon: 'Zap' as const },
  { id: 'menage', nom: 'Ménage', icon: 'Sparkles' as const },
  { id: 'beaute', nom: 'Beauté & Bien-être', icon: 'Scissors' as const },
  { id: 'mecanique', nom: 'Mécanique auto', icon: 'Car' as const },
  { id: 'climatisation', nom: 'Climatisation', icon: 'Wind' as const },
  { id: 'transport', nom: 'Transport', icon: 'Truck' as const },
  { id: 'tutorat', nom: 'Tutorat', icon: 'BookOpen' as const },
]

export const quartiers = [
  'Libreville Centre',
  'Akanda',
  'Owendo',
  'PK5',
  'PK8',
  'Nzeng-Ayong',
  'Port-Gentil',
  'Franceville',
]

export interface DemoBooking {
  id: string
  professionalId: string
  service: string
  status: string
  date: string
  heure: string
  address: string
  quartier: string
  totalPrice: number
  urgent: boolean
}

export const demoBookings: DemoBooking[] = [
  {
    id: 'RES-001',
    professionalId: '1',
    service: 'Réparation de fuite',
    status: 'en_route',
    date: '23 sept. 2026',
    heure: '14:30',
    address: 'Résidence Akanda, Bât. C',
    quartier: 'Akanda',
    totalPrice: 15000,
    urgent: true,
  },
  {
    id: 'RES-002',
    professionalId: '2',
    service: 'Ménage complet (maison)',
    status: 'acceptee',
    date: '24 sept. 2026',
    heure: '09:00',
    address: '45 rue des Cocotiers',
    quartier: 'Owendo',
    totalPrice: 10500,
    urgent: false,
  },
  {
    id: 'RES-003',
    professionalId: '3',
    service: 'Dépannage électrique',
    status: 'terminee',
    date: '18 sept. 2026',
    heure: '10:00',
    address: 'Immeuble Okoumé, 3e étage',
    quartier: 'Libreville Centre',
    totalPrice: 25000,
    urgent: false,
  },
]

export function formatFCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
}

export function getStatusLabel(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    en_attente: { label: 'En attente', color: 'bg-gray-100 text-gray-700' },
    acceptee: { label: 'Acceptée', color: 'bg-blue-100 text-blue-700' },
    en_route: { label: 'En route', color: 'bg-orange-100 text-orange-700' },
    en_cours: { label: 'En cours', color: 'bg-emerald-100 text-emerald-700' },
    terminee: { label: 'Terminée', color: 'bg-green-100 text-green-800' },
    annulee: { label: 'Annulée', color: 'bg-red-100 text-red-700' },
    litige: { label: 'Litige', color: 'bg-orange-200 text-orange-800' },
  }
  return map[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
}
