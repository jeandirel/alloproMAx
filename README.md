# MOOV ASSIST — Collecte linguistique Fang

Application publique de collecte de 200 questions/réponses vocales et textuelles en Fang.

- Verrouillage atomique d'une question lors de son attribution
- Statuts partagés : Disponible / En cours / Déjà faite
- Expiration automatique d'une réservation abandonnée après 30 minutes
- Deux audios + deux transcriptions par question
- D1/SQLite pour les données, R2/Object Storage pour l'audio
- Branche isolée de l'application AlloPro principale
