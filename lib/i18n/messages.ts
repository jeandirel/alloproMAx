// i18n foundation (Phase 4) — a small, dependency-free key/value catalog.
//
// Scope: this is NOT a full string-by-string translation of the app. It covers a
// representative slice only — primary navigation, the login/signup pages, the
// homepage hero + final CTA, and the cookie-consent banner — verbatim from the
// current French UI (app/_components/landing-page.tsx, app/login/login-client.tsx,
// app/signup/signup-client.tsx, components/bottom-nav.tsx) plus natural English
// translations. Extracting the rest of the app's hard-coded French strings into
// this catalog is a separate, mostly-mechanical follow-up.
//
// Usage: see lib/i18n/context.tsx for the <I18nProvider> + useTranslations() hook
// that reads from this catalog.

export type Locale = 'fr' | 'en'

export const defaultLocale: Locale = 'fr'

export const supportedLocales: Locale[] = ['fr', 'en']

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return value === 'fr' || value === 'en'
}

// The French catalog is the source of truth for keys: `en` is typed as
// `Record<MessageKey, string>` below, so TypeScript flags any key that's missing
// from (or extra in) the English catalog at compile time.
const fr = {
  // Primary navigation (components/bottom-nav.tsx + landing page header)
  'nav.home': 'Accueil',
  'nav.search': 'Rechercher',
  'nav.bookings': 'Réservations',
  'nav.messages': 'Messages',
  'nav.profile': 'Profil',
  'nav.mySpace': 'Mon espace',
  'nav.login': 'Connexion',
  'nav.findPro': 'Trouver un pro',
  'nav.contact': 'Contact',
  'nav.terms': 'CGU de la démo',
  'nav.privacy': 'Confidentialité',
  'nav.socials': 'Réseaux sociaux',

  // Shared brand copy
  'brand.name': 'Allo Pro',
  'brand.tagline': 'Le bon professionnel, au bon moment.',

  // Homepage hero + final CTA (app/_components/landing-page.tsx)
  'home.demoBanner': 'Version de démonstration · Profils, avis et chiffres fictifs · Aucun paiement réel',
  'home.hero.eyebrow': 'Le savoir-faire d’ici, pour vous',
  'home.hero.titlePrefix': 'Un pro de',
  'home.hero.titleHighlight': 'confiance.',
  'home.hero.titleSuffix': 'Une maison sereine.',
  'home.hero.subtitle': 'Le bon professionnel, au bon moment. Découvrez des services à domicile et des professionnels vérifiés à Libreville.',
  'home.hero.zoneSrLabel': 'Votre quartier au Gabon',
  'home.hero.country': 'Gabon',
  'home.hero.trust.verified': 'Profils vérifiés',
  'home.hero.trust.pricing': 'Tarifs détaillés',
  'home.hero.trust.payment': 'Paiement de test',
  'home.hero.talentsEyebrow': 'Des talents près de vous',
  'home.hero.verifiedBadge': 'Profil vérifié · Démo',
  'home.hero.quoteTitle': 'Votre quotidien mérite du soin.',
  'home.hero.quoteBody': 'Comparez, échangez, puis réservez.',
  'home.hero.illustrativeCaption': 'Portraits illustratifs · Professionnels fictifs',
  'home.ctaPro.title': 'Vous êtes un professionnel ?',
  'home.ctaPro.body': 'Présentez votre savoir-faire et découvrez comment recevoir des missions près de chez vous.',
  'home.ctaPro.cta': 'Rejoindre Allo Pro',
  'home.footer.copyright': '© 2026 Allo Pro · Pensé pour le Gabon',

  // Login page (app/login/login-client.tsx)
  'auth.login.title': 'Connexion',
  'auth.login.exploreAdmin': 'Explorer l’administration (nouvelle démo privée)',
  'auth.login.exploreAdminError': 'Impossible d’ouvrir la démonstration administrateur.',
  'auth.login.connectionUnavailable': 'Connexion indisponible.',
  'auth.login.emailDivider': 'Ou retrouver votre compte par e-mail',
  'auth.login.submit': 'Se connecter',
  'auth.login.wrongCredentials': 'Email ou mot de passe incorrect',
  'auth.login.noAccountYet': 'Pas encore de compte ?',
  'auth.login.createAccountCta': 'Créer un compte',
  'auth.login.emailPlaceholder': 'votre@email.com',
  'auth.login.passwordPlaceholder': 'Votre mot de passe',

  // Signup page (app/signup/signup-client.tsx)
  'auth.signup.title': 'Créer un compte',
  'auth.signup.fullNameLabel': 'Nom complet',
  'auth.signup.fullNamePlaceholder': 'Votre nom complet',
  'auth.signup.passwordPlaceholder': 'Minimum 6 caractères',
  'auth.signup.passwordTooShort': 'Le mot de passe doit contenir au moins 6 caractères',
  'auth.signup.genericError': 'Erreur lors de la création du compte',
  'auth.signup.createdButLoginFailed': 'Compte créé, mais erreur de connexion. Essayez de vous connecter.',
  'auth.signup.submit': 'Créer mon compte',
  'auth.signup.alreadyHaveAccount': 'Déjà un compte ?',
  'auth.signup.loginCta': 'Se connecter',

  // Shared auth form fields (identical wording on both login and signup)
  'auth.common.emailLabel': 'Email',
  'auth.common.passwordLabel': 'Mot de passe',
  'auth.common.genericError': 'Une erreur est survenue',

  // Cookie consent banner (components/cookie-consent.tsx)
  'cookies.bannerLabel': 'Cookies et confidentialité',
  'cookies.message': 'Nous utilisons des cookies pour améliorer votre expérience et mesurer l’audience de la démonstration Allo Pro.',
  'cookies.learnMore': 'En savoir plus',
  'cookies.accept': 'Accepter',
} as const

export type MessageKey = keyof typeof fr

const en: Record<MessageKey, string> = {
  'nav.home': 'Home',
  'nav.search': 'Search',
  'nav.bookings': 'Bookings',
  'nav.messages': 'Messages',
  'nav.profile': 'Profile',
  'nav.mySpace': 'My space',
  'nav.login': 'Log in',
  'nav.findPro': 'Find a pro',
  'nav.contact': 'Contact',
  'nav.terms': 'Demo Terms of Use',
  'nav.privacy': 'Privacy',
  'nav.socials': 'Social media',

  'brand.name': 'Allo Pro',
  'brand.tagline': 'The right pro, right on time.',

  'home.demoBanner': 'Demo version · Profiles, reviews and figures are fictional · No real payments',
  'home.hero.eyebrow': 'Local know-how, for you',
  'home.hero.titlePrefix': 'A pro you can',
  'home.hero.titleHighlight': 'trust.',
  'home.hero.titleSuffix': 'A worry-free home.',
  'home.hero.subtitle': 'The right professional, right on time. Discover home services and verified professionals in Libreville.',
  'home.hero.zoneSrLabel': 'Your neighborhood in Gabon',
  'home.hero.country': 'Gabon',
  'home.hero.trust.verified': 'Verified profiles',
  'home.hero.trust.pricing': 'Detailed pricing',
  'home.hero.trust.payment': 'Test payment',
  'home.hero.talentsEyebrow': 'Talented pros near you',
  'home.hero.verifiedBadge': 'Verified profile · Demo',
  'home.hero.quoteTitle': 'Your everyday life deserves care.',
  'home.hero.quoteBody': 'Compare, chat, then book.',
  'home.hero.illustrativeCaption': 'Illustrative portraits · Fictional professionals',
  'home.ctaPro.title': 'Are you a professional?',
  'home.ctaPro.body': 'Showcase your expertise and find out how to receive jobs near you.',
  'home.ctaPro.cta': 'Join Allo Pro',
  'home.footer.copyright': '© 2026 Allo Pro · Made for Gabon',

  'auth.login.title': 'Log in',
  'auth.login.exploreAdmin': 'Explore the admin area (new private demo)',
  'auth.login.exploreAdminError': 'Could not open the admin demo.',
  'auth.login.connectionUnavailable': 'Connection unavailable.',
  'auth.login.emailDivider': 'Or find your account by email',
  'auth.login.submit': 'Log in',
  'auth.login.wrongCredentials': 'Incorrect email or password',
  'auth.login.noAccountYet': "Don't have an account yet?",
  'auth.login.createAccountCta': 'Create an account',
  'auth.login.emailPlaceholder': 'you@email.com',
  'auth.login.passwordPlaceholder': 'Your password',

  'auth.signup.title': 'Create an account',
  'auth.signup.fullNameLabel': 'Full name',
  'auth.signup.fullNamePlaceholder': 'Your full name',
  'auth.signup.passwordPlaceholder': 'Minimum 6 characters',
  'auth.signup.passwordTooShort': 'Password must be at least 6 characters long',
  'auth.signup.genericError': 'Error creating account',
  'auth.signup.createdButLoginFailed': 'Account created, but login failed. Try logging in.',
  'auth.signup.submit': 'Create my account',
  'auth.signup.alreadyHaveAccount': 'Already have an account?',
  'auth.signup.loginCta': 'Log in',

  'auth.common.emailLabel': 'Email',
  'auth.common.passwordLabel': 'Password',
  'auth.common.genericError': 'Something went wrong',

  'cookies.bannerLabel': 'Cookies and privacy',
  'cookies.message': 'We use cookies to improve your experience and measure audience on the Allo Pro demo.',
  'cookies.learnMore': 'Learn more',
  'cookies.accept': 'Accept',
}

export const messages: Record<Locale, Record<MessageKey, string>> = { fr, en }
