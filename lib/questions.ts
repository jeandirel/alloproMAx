export type SeedQuestion = {
  id: number;
  category: string;
  intent: string;
  question: string;
  answer: string;
};

const GROUPS = [
  [
    "Compte",
    "solde",
    "Je peux vous guider pour consulter votre solde. Pour votre sécurité, ne communiquez jamais votre code PIN. Suivez les étapes affichées dans votre application Moov Money.",
    [
      "Comment je vérifie mon solde Moov Money ?",
      "Je veux connaître l'argent qu'il me reste sur Moov Money.",
      "Où puis-je voir mon solde Moov Money ?",
      "Peux-tu m'aider à regarder mon solde ?",
      "Comment savoir combien j'ai sur mon compte Moov Money ?",
      "Je voudrais consulter le montant disponible sur mon compte.",
      "Comment afficher mon solde dans Moov Money ?",
      "Quel est le moyen de vérifier mon solde ?",
      "Je veux voir ce qu'il reste sur mon portefeuille Moov Money.",
      "Aide-moi à consulter mon solde Moov Money."
    ]
  ],
  [
    "Sécurité",
    "pin_oublie",
    "Ne communiquez votre code PIN à personne. Je peux vous guider vers la procédure de récupération ou vous orienter vers un agent d'assistance si une vérification d'identité est nécessaire.",
    [
      "J'ai perdu mon code PIN Moov Money, comment le récupérer ?",
      "Je ne me souviens plus de mon PIN, que faire ?",
      "Comment réinitialiser mon code PIN Moov Money ?",
      "Mon code PIN m'échappe, peux-tu m'aider ?",
      "Que dois-je faire si j'ai oublié mon PIN ?",
      "Je veux récupérer l'accès à mon compte après avoir oublié mon PIN.",
      "Comment changer mon PIN si je l'ai oublié ?",
      "Je n'arrive plus à me rappeler mon code secret Moov Money.",
      "Mon PIN ne me revient plus, quelle est la procédure ?",
      "Aide-moi à récupérer mon code PIN Moov Money."
    ]
  ],
  [
    "Compte",
    "compte_bloque",
    "Je peux vous guider dans le diagnostic du blocage et vous orienter vers l'assistance si une vérification d'identité est nécessaire. Ne partagez jamais votre code PIN.",
    [
      "Pourquoi mon compte Moov Money est-il bloqué ?",
      "Je n'arrive plus à utiliser mon compte, que faire ?",
      "Comment débloquer mon compte Moov Money ?",
      "Mon accès Moov Money est verrouillé, aide-moi.",
      "Je ne peux plus faire d'opérations sur mon compte.",
      "Mon compte semble suspendu, comment régler ça ?",
      "Je veux retrouver l'accès à mon compte bloqué.",
      "Que faire lorsque Moov Money refuse l'accès à mon compte ?",
      "Mon portefeuille Moov Money est bloqué depuis aujourd'hui.",
      "Aide-moi à comprendre pourquoi mon compte est bloqué."
    ]
  ],
  [
    "Compte",
    "sim",
    "Je peux vous guider selon votre situation. Une vérification d'identité peut être nécessaire pour sécuriser l'accès à votre compte après un changement de SIM.",
    [
      "J'ai remplacé ma SIM, comment récupérer Moov Money ?",
      "Mon numéro a changé de SIM, mon compte va-t-il fonctionner ?",
      "Que faire avec Moov Money après un remplacement de carte SIM ?",
      "J'ai une nouvelle puce, comment accéder à mon compte ?",
      "Ma SIM a été remplacée, aide-moi pour Moov Money.",
      "Est-ce que je dois mettre à jour quelque chose après avoir changé de SIM ?",
      "Je n'arrive plus à accéder à Moov Money depuis le changement de SIM.",
      "Comment rattacher mon compte à ma nouvelle carte SIM ?",
      "J'ai perdu ma SIM et j'en ai récupéré une nouvelle, que faire ?",
      "Quelle est la procédure Moov Money après un changement de puce ?"
    ]
  ],
  [
    "Transactions",
    "envoi_argent",
    "Je peux préparer l'envoi avec vous. Vérifiez le bénéficiaire et le montant avant de confirmer. L'opération ne doit être exécutée qu'après votre validation sécurisée.",
    [
      "Comment envoyer 5 000 FCFA avec Moov Money ?",
      "Je veux transférer de l'argent à un membre de ma famille.",
      "Aide-moi à envoyer de l'argent à quelqu'un.",
      "Je dois faire un transfert Moov Money de 5 000 francs.",
      "Comment transférer de l'argent vers un autre numéro ?",
      "Je souhaite envoyer une somme à un proche avec Moov Money.",
      "Prépare un transfert de 5 000 FCFA pour moi.",
      "Je veux faire un envoi d'argent depuis mon portefeuille.",
      "Quelle est la procédure pour envoyer de l'argent ?",
      "Peux-tu m'aider à effectuer un transfert Moov Money ?"
    ]
  ],
  [
    "Transactions",
    "envoi_international",
    "Je peux vérifier avec vous les options de transfert disponibles et préparer l'opération si le service est accessible. Vérifiez toujours le pays, le bénéficiaire, le montant et les frais avant de confirmer.",
    [
      "Puis-je envoyer de l'argent au Cameroun avec Moov Money ?",
      "Comment faire un transfert vers un proche qui est au Cameroun ?",
      "Je veux envoyer 10 000 FCFA à l'étranger.",
      "Est-ce que Moov Money permet les transferts vers un autre pays ?",
      "Comment envoyer de l'argent hors du Gabon ?",
      "Je dois faire un transfert international avec Moov Money.",
      "Peux-tu vérifier si je peux envoyer de l'argent au Cameroun ?",
      "Je veux transférer de l'argent à un membre de ma famille à l'étranger.",
      "Comment fonctionne l'envoi d'argent international ?",
      "Aide-moi à préparer un transfert vers le Cameroun."
    ]
  ],
  [
    "Transactions",
    "transaction_echouee",
    "Consultez d'abord le statut et l'historique de la transaction. Évitez de refaire immédiatement le même transfert. Si votre compte a été débité sans que le bénéficiaire reçoive l'argent, je peux vous aider à ouvrir une réclamation.",
    [
      "Mon transfert n'est pas passé, que dois-je faire ?",
      "La transaction a échoué mais j'ai peur d'avoir été débité.",
      "Moov Money affiche échec sur mon transfert.",
      "Je ne sais pas si mon transfert a été pris en compte.",
      "Une opération vient d'échouer, comment vérifier mon argent ?",
      "Mon envoi d'argent a échoué, aide-moi à vérifier.",
      "Je viens d'avoir une erreur pendant un transfert.",
      "La transaction ne s'est pas terminée correctement.",
      "Comment savoir si une transaction échouée m'a quand même débité ?",
      "Que faire après un transfert Moov Money échoué ?"
    ]
  ],
  [
    "Transactions",
    "beneficiaire_non_recu",
    "Vérifiez le statut de la transaction et les informations du bénéficiaire. Si le débit est confirmé sans réception, je peux vous aider à lancer une réclamation et à obtenir un numéro de suivi.",
    [
      "J'ai été débité mais la personne n'a rien reçu.",
      "Le destinataire n'a pas reçu mon transfert.",
      "Mon argent est parti mais le bénéficiaire ne l'a pas reçu.",
      "Que faire si le transfert est débité mais non reçu ?",
      "Le bénéficiaire dit qu'il n'a pas reçu l'argent.",
      "Mon compte a diminué mais l'envoi n'est pas arrivé.",
      "J'ai un problème de transfert non reçu par le destinataire.",
      "Comment réclamer pour un transfert débité mais non reçu ?",
      "Le destinataire attend toujours l'argent alors que j'ai été débité.",
      "Aide-moi, mon transfert n'est jamais arrivé au bénéficiaire."
    ]
  ],
  [
    "Recharge",
    "recharge_soi",
    "Je peux préparer la recharge. Vérifiez le numéro concerné et le montant de 1 000 FCFA, puis confirmez l'opération de manière sécurisée.",
    [
      "Recharge mon numéro de 1 000 FCFA.",
      "Comment acheter 1 000 francs de crédit avec Moov Money ?",
      "Je veux mettre du crédit sur mon téléphone.",
      "Aide-moi à acheter du crédit téléphonique.",
      "Je souhaite faire une recharge de 1 000 FCFA.",
      "Comment recharger mon propre numéro depuis Moov Money ?",
      "Je veux acheter du crédit pour ma ligne.",
      "Peux-tu préparer une recharge de 1 000 francs ?",
      "Je veux ajouter du crédit à mon téléphone avec Moov Money.",
      "Quelle est la procédure pour acheter du crédit airtime ?"
    ]
  ],
  [
    "Recharge",
    "recharge_tiers",
    "Je peux préparer la recharge d'un autre numéro. Vérifiez attentivement le numéro du bénéficiaire et le montant avant de confirmer l'opération.",
    [
      "Comment acheter du crédit pour quelqu'un d'autre ?",
      "Je veux recharger le téléphone de ma mère.",
      "Peux-tu mettre du crédit sur un autre numéro ?",
      "Je souhaite faire une recharge pour un proche.",
      "Comment recharger le numéro de mon frère avec Moov Money ?",
      "Je veux envoyer du crédit téléphonique à quelqu'un.",
      "Aide-moi à faire une recharge sur un autre numéro.",
      "Est-ce que je peux acheter du crédit pour une autre personne ?",
      "Je veux recharger une ligne qui n'est pas la mienne.",
      "Prépare une recharge pour le numéro d'un proche."
    ]
  ],
  [
    "Paiements",
    "facture_seeg",
    "Je peux vous guider pour le paiement. Préparez la référence de la facture, vérifiez le montant et confirmez les informations avant toute validation sécurisée.",
    [
      "Je veux régler ma facture SEEG avec Moov Money.",
      "Comment payer l'électricité avec Moov Money ?",
      "Aide-moi à payer ma facture SEEG.",
      "Puis-je régler ma facture SEEG depuis mon téléphone ?",
      "Je dois payer la SEEG, comment faire ?",
      "Quelle est la procédure de paiement SEEG dans Moov Money ?",
      "Je veux utiliser Moov Money pour payer mon électricité.",
      "Comment saisir ma référence SEEG pour payer ?",
      "Peux-tu me guider pour payer la SEEG ?",
      "Je souhaite effectuer un paiement de facture SEEG."
    ]
  ],
  [
    "Paiements",
    "facture_canal",
    "Je peux vous guider pour le paiement Canal+. Vérifiez votre référence ou numéro d'abonné ainsi que le montant avant de confirmer l'opération de manière sécurisée.",
    [
      "Je veux payer Canal+ avec Moov Money.",
      "Comment renouveler mon abonnement Canal+ depuis Moov Money ?",
      "Aide-moi à régler Canal+.",
      "Puis-je payer mon bouquet Canal+ avec mon portefeuille ?",
      "Je dois renouveler Canal+, comment faire ?",
      "Quelle est la procédure pour payer Canal+ ?",
      "Je veux utiliser Moov Money pour mon abonnement Canal+.",
      "Comment saisir mon numéro d'abonné Canal+ pour payer ?",
      "Peux-tu m'aider à faire le paiement Canal+ ?",
      "Je souhaite régler ma facture Canal+ avec Moov Money."
    ]
  ],
  [
    "Compte",
    "historique",
    "Je peux vous aider à consulter l'historique de vos transactions après vérification de votre accès au compte. Vous pourrez ensuite identifier la transaction que vous recherchez.",
    [
      "Comment consulter mon historique Moov Money ?",
      "Je veux revoir mes dernières opérations.",
      "Où trouver la liste de mes transactions ?",
      "Montre-moi comment vérifier mes anciens transferts.",
      "Je cherche une transaction dans mon historique.",
      "Comment retrouver une opération faite récemment ?",
      "Je veux consulter les mouvements de mon compte.",
      "Peux-tu m'aider à voir mes transactions passées ?",
      "Où est l'historique de mon portefeuille Moov Money ?",
      "Je souhaite vérifier mes dernières opérations Moov Money."
    ]
  ],
  [
    "Support",
    "reclamation",
    "Je peux recueillir les informations nécessaires à votre réclamation et transmettre le dossier au support. Un numéro de suivi doit vous permettre de suivre son traitement.",
    [
      "Comment ouvrir une réclamation Moov Money ?",
      "Je veux signaler un problème sur une transaction.",
      "Aide-moi à déposer une réclamation.",
      "J'ai un litige sur une opération et je veux le signaler.",
      "Comment contacter le support pour une transaction ?",
      "Je souhaite créer un dossier de réclamation.",
      "Je veux déclarer un problème avec un transfert.",
      "Quelle est la procédure pour faire une réclamation ?",
      "Je veux que le support regarde ma transaction.",
      "Peux-tu m'aider à signaler une opération problématique ?"
    ]
  ],
  [
    "Support",
    "suivi_ticket",
    "Si vous avez un numéro de ticket, je peux vous guider pour consulter l'état d'avancement de votre réclamation ou vous orienter vers le support.",
    [
      "Où en est ma réclamation ?",
      "Je veux connaître le statut de mon ticket.",
      "Comment suivre mon dossier auprès du support ?",
      "J'ai un numéro de réclamation, comment voir l'avancement ?",
      "Mon ticket est-il toujours en traitement ?",
      "Je veux savoir si ma réclamation a été traitée.",
      "Comment vérifier l'état de mon dossier Moov Money ?",
      "Peux-tu m'aider à suivre mon ticket support ?",
      "Je n'ai pas de nouvelles de ma réclamation.",
      "Je souhaite consulter l'avancement de ma demande au support."
    ]
  ],
  [
    "Sécurité",
    "fraude",
    "Ne partagez aucun code PIN ni information confidentielle. Je peux vous orienter immédiatement vers l'assistance afin de vérifier la transaction et sécuriser votre compte.",
    [
      "Il y a une opération inconnue sur mon compte.",
      "Je n'ai pas effectué cette transaction.",
      "Je vois un débit que je ne reconnais pas.",
      "Quelqu'un a peut-être utilisé mon compte Moov Money.",
      "Que faire en cas de transaction suspecte ?",
      "Je pense qu'une opération frauduleuse a été faite.",
      "Une transaction apparaît dans mon historique mais ce n'est pas moi.",
      "Comment sécuriser mon compte après une opération inconnue ?",
      "J'ai repéré un mouvement suspect sur Moov Money.",
      "Aide-moi, je ne reconnais pas une transaction."
    ]
  ],
  [
    "Onboarding",
    "inscription",
    "Je peux vous guider étape par étape pour l'inscription. Préparez les documents d'identification demandés et suivez les vérifications affichées. Ne transmettez vos documents que dans les canaux officiels prévus.",
    [
      "Je veux ouvrir un compte Moov Money.",
      "Comment m'inscrire à Moov Money ?",
      "Quelle est la procédure pour créer mon portefeuille ?",
      "Aide-moi à créer un nouveau compte.",
      "Je souhaite commencer à utiliser Moov Money.",
      "Comment faire mon inscription Moov Money ?",
      "De quoi ai-je besoin pour ouvrir un compte ?",
      "Je veux créer mon compte depuis mon téléphone.",
      "Peux-tu me guider pour l'ouverture d'un compte ?",
      "Comment devenir utilisateur Moov Money ?"
    ]
  ],
  [
    "Onboarding",
    "kyc_documents",
    "Je peux vous indiquer les documents demandés dans le parcours officiel et vous guider pour les transmettre via les canaux prévus. Une pièce d'identité et d'autres justificatifs peuvent être demandés selon votre situation.",
    [
      "De quels papiers ai-je besoin pour le KYC ?",
      "Quels documents faut-il pour valider mon compte ?",
      "Que dois-je préparer pour la vérification d'identité ?",
      "On me demande des documents pour Moov Money, lesquels ?",
      "Comment compléter la vérification KYC ?",
      "Je veux savoir quelles pièces fournir pour mon compte.",
      "Quels justificatifs sont nécessaires pour l'inscription ?",
      "Comment envoyer mes documents d'identité à Moov Money ?",
      "Il me manque quoi pour terminer la vérification de mon compte ?",
      "Aide-moi avec les documents nécessaires au KYC."
    ]
  ],
  [
    "Conseils",
    "budget_epargne",
    "Je peux vous proposer des conseils généraux de budget et d'épargne à partir des informations que vous choisissez de partager, sans prendre de décision financière à votre place.",
    [
      "Comment économiser davantage chaque mois ?",
      "Aide-moi à organiser mes dépenses.",
      "Je veux mieux gérer mon argent avec Moov Money.",
      "Peux-tu me donner des conseils pour épargner ?",
      "Comment faire un budget simple ?",
      "Je dépense trop, aide-moi à mieux m'organiser.",
      "Je voudrais mettre un peu d'argent de côté.",
      "Comment suivre mes habitudes de dépenses ?",
      "Donne-moi des conseils pour mieux gérer mon portefeuille.",
      "Je veux commencer à épargner, comment m'organiser ?"
    ]
  ],
  [
    "Support",
    "agent_humain",
    "Je peux vous orienter vers un agent humain et transmettre un résumé du contexte afin que vous n'ayez pas à répéter toute votre demande.",
    [
      "Passe-moi un conseiller s'il te plaît.",
      "Je préfère parler à une vraie personne.",
      "Comment contacter un agent du support ?",
      "Je veux être transféré vers un conseiller.",
      "Peux-tu me mettre en relation avec le service client ?",
      "Je ne veux plus parler au bot, je veux un agent.",
      "J'ai besoin d'une assistance humaine.",
      "Transfère ma conversation à quelqu'un du support.",
      "Je souhaite parler avec un conseiller Moov Money.",
      "Comment joindre un agent humain depuis l'assistant ?"
    ]
  ]
] as const;

export const QUESTIONS: SeedQuestion[] = GROUPS.flatMap((group, groupIndex) => {
  const [category, intent, answer, variants] = group;
  return variants.map((question, variantIndex) => ({
    id: groupIndex * 10 + variantIndex + 1,
    category,
    intent,
    question,
    answer,
  }));
});
