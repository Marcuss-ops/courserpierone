/**
 * Auth UI Translations
 *
 * Traduzioni per le pagine standalone (login, signup, common UI).
 * Basate sul codice lingua (2 lettere), non sul locale completo.
 * Aggiungere nuove lingue è semplice: basta aggiungere una chiave.
 */

const authTranslations: Record<string, AuthStrings> = {
  // ═══ Italiano ═══
  it: {
    loginTitle: "Accedi al tuo account",
    signupTitle: "Crea il tuo account",
    loginSubtitle: "Bentornato! Inserisci le tue credenziali",
    signupSubtitle: "Inizia il tuo percorso di apprendimento",
    continueWithGoogle: "Continua con Google",
    or: "oppure",
    email: "Email",
    password: "Password",
    login: "Accedi",
    signup: "Crea account",
    noAccount: "Non hai un account?",
    hasAccount: "Hai già un account?",
    register: "Registrati",
    checkEmail: "Controlla la tua email per confermare l'account.",
    invalidCredentials: "Email o password non corretti.",
    genericError: "Si è verificato un errore. Riprova.",
    backToHome: "Torna alla home",
    discoverCourses: "Scopri i nostri corsi",
    alreadyPurchased: "Hai già acquistato? Accedi per vedere il corso.",
  },

  // ═══ English ═══
  en: {
    loginTitle: "Sign in to your account",
    signupTitle: "Create your account",
    loginSubtitle: "Welcome back! Enter your credentials",
    signupSubtitle: "Start your learning journey",
    continueWithGoogle: "Continue with Google",
    or: "or",
    email: "Email",
    password: "Password",
    login: "Sign in",
    signup: "Create account",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    register: "Sign up",
    checkEmail: "Check your email to confirm your account.",
    invalidCredentials: "Incorrect email or password.",
    genericError: "An error occurred. Please try again.",
    backToHome: "Back to home",
    discoverCourses: "Discover our courses",
    alreadyPurchased: "Already purchased? Sign in to view the course.",
  },

  // ═══ Français ═══
  fr: {
    loginTitle: "Connectez-vous à votre compte",
    signupTitle: "Créez votre compte",
    loginSubtitle: "Bienvenue ! Entrez vos identifiants",
    signupSubtitle: "Commencez votre parcours d'apprentissage",
    continueWithGoogle: "Continuer avec Google",
    or: "ou",
    email: "Email",
    password: "Mot de passe",
    login: "Se connecter",
    signup: "Créer un compte",
    noAccount: "Pas encore de compte ?",
    hasAccount: "Déjà un compte ?",
    register: "S'inscrire",
    checkEmail: "Vérifiez votre email pour confirmer votre compte.",
    invalidCredentials: "Email ou mot de passe incorrect.",
    genericError: "Une erreur s'est produite. Réessayez.",
    backToHome: "Retour à l'accueil",
    discoverCourses: "Découvrez nos cours",
    alreadyPurchased: "Déjà acheté ? Connectez-vous pour voir le cours.",
  },

  // ═══ Español ═══
  es: {
    loginTitle: "Inicia sesión en tu cuenta",
    signupTitle: "Crea tu cuenta",
    loginSubtitle: "¡Bienvenido! Ingresa tus credenciales",
    signupSubtitle: "Comienza tu viaje de aprendizaje",
    continueWithGoogle: "Continuar con Google",
    or: "o",
    email: "Correo electrónico",
    password: "Contraseña",
    login: "Iniciar sesión",
    signup: "Crear cuenta",
    noAccount: "¿No tienes cuenta?",
    hasAccount: "¿Ya tienes cuenta?",
    register: "Regístrate",
    checkEmail: "Revisa tu correo para confirmar tu cuenta.",
    invalidCredentials: "Correo o contraseña incorrectos.",
    genericError: "Ocurrió un error. Inténtalo de nuevo.",
    backToHome: "Volver al inicio",
    discoverCourses: "Descubre nuestros cursos",
    alreadyPurchased: "¿Ya compraste? Inicia sesión para ver el curso.",
  },

  // ═══ Deutsch ═══
  de: {
    loginTitle: "Melde dich bei deinem Konto an",
    signupTitle: "Erstelle dein Konto",
    loginSubtitle: "Willkommen zurück! Gib deine Zugangsdaten ein",
    signupSubtitle: "Beginne deine Lernreise",
    continueWithGoogle: "Mit Google fortfahren",
    or: "oder",
    email: "E-Mail",
    password: "Passwort",
    login: "Anmelden",
    signup: "Konto erstellen",
    noAccount: "Noch kein Konto?",
    hasAccount: "Bereits ein Konto?",
    register: "Registrieren",
    checkEmail: "Überprüfe deine E-Mail, um dein Konto zu bestätigen.",
    invalidCredentials: "E-Mail oder Passwort falsch.",
    genericError: "Ein Fehler ist aufgetreten. Versuche es erneut.",
    backToHome: "Zurück zur Startseite",
    discoverCourses: "Entdecke unsere Kurse",
    alreadyPurchased: "Bereits gekauft? Melde dich an, um den Kurs zu sehen.",
  },

  // ═══ Português ═══
  pt: {
    loginTitle: "Entre na sua conta",
    signupTitle: "Crie sua conta",
    loginSubtitle: "Bem-vindo de volta! Insira suas credenciais",
    signupSubtitle: "Comece sua jornada de aprendizado",
    continueWithGoogle: "Continuar com Google",
    or: "ou",
    email: "E-mail",
    password: "Senha",
    login: "Entrar",
    signup: "Criar conta",
    noAccount: "Não tem uma conta?",
    hasAccount: "Já tem uma conta?",
    register: "Cadastre-se",
    checkEmail: "Verifique seu e-mail para confirmar sua conta.",
    invalidCredentials: "E-mail ou senha incorretos.",
    genericError: "Ocorreu um erro. Tente novamente.",
    backToHome: "Voltar ao início",
    discoverCourses: "Descubra nossos cursos",
    alreadyPurchased: "Já comprou? Entre para ver o curso.",
  },

  // ═══ 日本語 ═══
  ja: {
    loginTitle: "アカウントにサインイン",
    signupTitle: "アカウントを作成",
    loginSubtitle: "おかえりなさい！認証情報を入力してください",
    signupSubtitle: "学習の旅を始めましょう",
    continueWithGoogle: "Googleで続ける",
    or: "または",
    email: "メールアドレス",
    password: "パスワード",
    login: "サインイン",
    signup: "アカウント作成",
    noAccount: "アカウントをお持ちでないですか？",
    hasAccount: "すでにアカウントをお持ちですか？",
    register: "新規登録",
    checkEmail: "メールを確認してアカウントを認証してください。",
    invalidCredentials: "メールアドレスまたはパスワードが正しくありません。",
    genericError: "エラーが発生しました。もう一度お試しください。",
    backToHome: "ホームに戻る",
    discoverCourses: "コースを探す",
    alreadyPurchased: "購入済みですか？サインインしてコースを表示。",
  },

  // ═══ العربية ═══
  ar: {
    loginTitle: "تسجيل الدخول إلى حسابك",
    signupTitle: "إنشاء حسابك",
    loginSubtitle: "مرحبًا بعودتك! أدخل بيانات الاعتماد الخاصة بك",
    signupSubtitle: "ابدأ رحلة التعلم الخاصة بك",
    continueWithGoogle: "المتابعة مع Google",
    or: "أو",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
    noAccount: "ليس لديك حساب؟",
    hasAccount: "لديك حساب بالفعل؟",
    register: "إنشاء حساب",
    checkEmail: "تحقق من بريدك الإلكتروني لتأكيد حسابك.",
    invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    genericError: "حدث خطأ. يرجى المحاولة مرة أخرى.",
    backToHome: "العودة إلى الصفحة الرئيسية",
    discoverCourses: "اكتشف دوراتنا",
    alreadyPurchased: "اشتريت بالفعل؟ سجل الدخول لعرض الدورة.",
  },

  // ═══ 中文 ═══
  zh: {
    loginTitle: "登录您的账户",
    signupTitle: "创建您的账户",
    loginSubtitle: "欢迎回来！请输入您的凭据",
    signupSubtitle: "开始您的学习之旅",
    continueWithGoogle: "使用 Google 继续",
    or: "或",
    email: "邮箱",
    password: "密码",
    login: "登录",
    signup: "创建账户",
    noAccount: "没有账户？",
    hasAccount: "已有账户？",
    register: "注册",
    checkEmail: "请检查您的邮箱以确认账户。",
    invalidCredentials: "邮箱或密码不正确。",
    genericError: "发生错误。请重试。",
    backToHome: "返回首页",
    discoverCourses: "发现我们的课程",
    alreadyPurchased: "已购买？登录以查看课程。",
  },
};

export interface AuthStrings {
  loginTitle: string;
  signupTitle: string;
  loginSubtitle: string;
  signupSubtitle: string;
  continueWithGoogle: string;
  or: string;
  email: string;
  password: string;
  login: string;
  signup: string;
  noAccount: string;
  hasAccount: string;
  register: string;
  checkEmail: string;
  invalidCredentials: string;
  genericError: string;
  backToHome: string;
  discoverCourses: string;
  alreadyPurchased: string;
}

// English as universal fallback
const FALLBACK: AuthStrings = authTranslations.en;

/**
 * Get auth translations for a given language code.
 * Falls back to English if the language is not supported.
 *
 * @param langCode - 2-letter language code (e.g. "it", "en", "fr")
 */
export function getAuthTranslations(langCode: string): AuthStrings {
  const normalized = langCode.toLowerCase().split("-")[0];
  return authTranslations[normalized] ?? FALLBACK;
}
