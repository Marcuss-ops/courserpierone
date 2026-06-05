import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { 
  BookOpen, 
  Play, 
  TrendingUp, 
  ChevronRight,
  LogOut,
  User,
  Calendar,
  Award,
  GraduationCap,
  Package,
  ArrowRight,
  FileText
} from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    redirect("/login");
  }

  let userOrders: any[] = [];
  if (user.role === "admin") {
    const publishedProducts = await prisma.product.findMany({
      where: { status: "published" },
      select: {
        id: true,
        slug: true,
        coverUrl: true,
        price: true,
        currency: true,
        templateId: true,
        _count: { select: { lessons: true } },
      },
    });
    userOrders = publishedProducts.map(p => ({
      id: `admin-virtual-order-${p.id}`,
      userId: user.id,
      productId: p.id,
      amount: p.price,
      currency: p.currency,
      locale: "it",
      status: "completed",
      createdAt: new Date(),
      product: p,
    }));
  } else {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        orders: {
          where: { status: "completed" },
          include: {
            product: {
              select: {
                id: true,
                slug: true,
                coverUrl: true,
                price: true,
                currency: true,
                templateId: true,
                _count: { select: { lessons: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    userOrders = dbUser?.orders ?? [];
  }

  // Progress stats — i conteggi lezioni sono già nell'include della query ordini
  const completedLessons = await prisma.lessonProgress.count({
    where: { userId: user.id, completed: true },
  });

  const totalLessons = userOrders.reduce((sum, o) => sum + o.product._count.lessons, 0);
  const progressPercent = totalLessons > 0 
    ? Math.round((completedLessons / totalLessons) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-dashboard-bg font-hanken">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 bg-black/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 premium-glass rounded-xl flex items-center justify-center font-bold text-xl border border-white/10 text-white shadow-lg group-hover:border-accent-primary/30 transition-colors">
              C
            </div>
            <span className="text-2xl font-black tracking-tighter text-white uppercase">Courser.</span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="hidden sm:flex items-center gap-2 px-4 py-2 premium-glass rounded-xl text-[10px] font-black text-zinc-400 hover:text-white transition-all uppercase tracking-widest border border-white/5"
            >
              Home
            </Link>
            <div className="flex items-center gap-3 pl-4 border-l border-white/10">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 border border-white/10 flex items-center justify-center overflow-hidden">
                {user.image ? (
                  <img src={user.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-zinc-400" />
                )}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-bold text-white text-contrast">{user.name || user.email?.split("@")[0]}</p>
                <p className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">
                  {user.role === "admin" ? "Admin" : "Studente"}
                </p>
              </div>
            </div>
            <a
              href="/api/auth/signout"
              className="p-2.5 premium-glass rounded-xl text-zinc-500 hover:text-red-400 transition-all border border-white/5 hover:border-red-500/20"
            >
              <LogOut className="w-4 h-4" />
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12 pb-24 space-y-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-accent-primary/5 rounded-full blur-[120px] -z-10" />
          <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-accent-secondary/5 rounded-full blur-[120px] -z-10" />

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 premium-glass rounded-full border border-white/5">
                <div className="w-2 h-2 rounded-full bg-accent-tertiary animate-pulse" />
                <span className="text-[10px] font-black text-accent-tertiary uppercase tracking-widest">
                  Benvenuto, {user.name?.split(" ")[0] ?? "Studente"}
                </span>
              </div>
              <h1 className="text-4xl lg:text-6xl font-black text-white text-contrast tracking-tighter leading-[0.95]">
                La tua <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary via-accent-secondary to-accent-tertiary">
                  Biblioteca Digitale
                </span>
              </h1>
              <p className="max-w-xl text-zinc-500 text-base lg:text-lg font-medium leading-relaxed">
                Tutti i tuoi corsi, ebook e contenuti premium in un unico posto. 
                Riprendi da dove hai lasciato.
              </p>
            </div>

            {userOrders.length > 0 && (
              <div className="flex items-center gap-6 p-6 premium-glass rounded-[2rem] border border-white/5 shrink-0">
                <div className="text-center">
                  <div className="text-3xl font-black text-white text-contrast">{userOrders.length}</div>
                  <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mt-1">Corsi</div>
                </div>
                <div className="w-px h-12 bg-white/10" />
                <div className="text-center">
                  <div className="text-3xl font-black text-white text-contrast">{completedLessons}</div>
                  <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mt-1">Lezioni Fatte</div>
                </div>
                <div className="w-px h-12 bg-white/10" />
                <div className="text-center">
                  <div className="text-3xl font-black text-accent-primary text-contrast">{progressPercent}%</div>
                  <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mt-1">Progresso</div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Profile & Quick Stats */}
        <section className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Profile Card */}
          <div className="premium-glass p-8 rounded-[2rem] border border-white/5 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 border border-white/10 flex items-center justify-center overflow-hidden shadow-xl">
                {user.image ? (
                  <img src={user.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-7 h-7 text-zinc-400" />
                )}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white text-contrast">{user.name ?? "Studente"}</h2>
                <p className="text-xs text-zinc-500 font-medium">{user.email}</p>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <Calendar className="w-3.5 h-3.5 text-accent-primary/60" />
                <span>Membro dal <strong className="text-zinc-300">{new Date(user.createdAt).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}</strong></span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <Award className="w-3.5 h-3.5 text-accent-tertiary/60" />
                <span>
                  {userOrders.length === 0 ? "Ancora nessun corso acquistato" : 
                   `${userOrders.length} corso${userOrders.length > 1 ? "i" : ""} acquistato${userOrders.length > 1 ? "i" : ""}`}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400">
                <GraduationCap className="w-3.5 h-3.5 text-accent-secondary/60" />
                <span>{completedLessons} lezione{completedLessons !== 1 ? "i" : ""} completat{completedLessons !== 1 ? "e" : "a"}</span>
              </div>
            </div>
          </div>
 
          {/* Quick Stats */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <StatCard 
              icon={<BookOpen className="w-5 h-5 text-accent-tertiary" />}
              label="Corsi Acquisti"
              value={userOrders.length}
              subtitle={userOrders.length > 0 ? "Pronti da studiare" : "Nessun corso ancora"}
            />
            <StatCard 
              icon={<Play className="w-5 h-5 text-accent-primary" />}
              label="Lezioni Completate"
              value={completedLessons}
              subtitle={totalLessons > 0 ? `Su ${totalLessons} totali` : "Inizia il tuo primo corso"}
            />
            <StatCard 
              icon={<TrendingUp className="w-5 h-5 text-accent-secondary" />}
              label="Progresso Globale"
              value={`${progressPercent}%`}
              subtitle={progressPercent > 0 ? "Continua così! 🚀" : "Inizia ora"}
            />
          </div>
        </section>

        {/* My Courses Section */}
        <section className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl lg:text-3xl font-black text-white text-contrast tracking-tight">
                I Miei Corsi
              </h2>
              <p className="text-sm text-zinc-500 font-medium">
                {userOrders.length === 0 
                  ? "Acquista il tuo primo corso per iniziare il tuo percorso di apprendimento"
                  : `${userOrders.length} corso${userOrders.length > 1 ? "i" : ""} acquistato${userOrders.length > 1 ? "i" : ""} — riprendi da dove hai lasciato`
                }
              </p>
            </div>
            {userOrders.length > 0 && (
              <Link 
                href="/" 
                className="hidden sm:flex items-center gap-2 px-5 py-2.5 premium-glass rounded-xl text-[10px] font-black uppercase tracking-widest text-accent-primary hover:text-white transition-all border border-white/5"
              >
                Scopri Altri Corsi <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {userOrders.length === 0 ? (
            <div className="premium-glass p-16 lg:p-20 rounded-[2.5rem] border border-white/5 text-center space-y-8 relative overflow-hidden group">
              <div className="absolute -right-32 -top-32 w-80 h-80 bg-accent-primary/5 rounded-full blur-[100px] group-hover:bg-accent-primary/10 transition-all duration-700" />
              
              <div className="w-24 h-24 premium-glass rounded-full flex items-center justify-center mx-auto border border-white/10 relative z-10">
                <Package className="w-12 h-12 text-zinc-500" />
              </div>
              <div className="space-y-3 relative z-10">
                <h3 className="text-2xl font-black text-white text-contrast">Nessun corso ancora</h3>
                <p className="text-zinc-500 text-sm max-w-md mx-auto font-medium">
                  Non hai ancora acquistato nessun corso. Scegli tra i nostri prodotti premium e inizia il tuo percorso di apprendimento.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-2 glow-btn px-8 py-4 rounded-2xl text-sm font-bold text-white premium-glass relative z-10"
              >
                Scopri i Corsi <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {userOrders.map((order: any) => (
                <CourseCard
                  key={order.id}
                  slug={order.product.slug}
                  coverUrl={order.product.coverUrl}
                  templateId={order.product.templateId}
                  lessonCount={order.product._count.lessons}
                  purchasedAt={order.createdAt}
                  amount={order.amount}
                  currency={order.currency}
                />
              ))}
            </div>
          )}
        </section>
 
        {/* Continue Learning + Certificati */}
        {userOrders.length > 0 && <ContinueAndCertificatesSection userId={user.id} orders={userOrders.map(o => ({
            id: o.id,
            createdAt: o.createdAt,
            product: {
              id: o.product.id,
              slug: o.product.slug,
              coverUrl: o.product.coverUrl,
              templateId: o.product.templateId,
              _count: { lessons: o.product._count.lessons },
            },
          }))} />}
      </main>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

async function ContinueAndCertificatesSection({
  userId,
  orders,
}: {
  userId: string;
  orders: {
    id: string;
    product: { id: string; slug: string; coverUrl: string | null; templateId: string; _count: { lessons: number } };
    createdAt: Date;
  }[];
}) {
  // Trova l'ultima lezione guardata
  const lastWatch = await prisma.lessonProgress.findFirst({
    where: { userId, lastWatchedAt: { not: null } },
    orderBy: { lastWatchedAt: "desc" },
    include: {
      lesson: {
        select: {
          id: true,
          position: true,
          product: { select: { slug: true, defaultLanguage: true } },
          translations: { take: 1, select: { title: true, locale: true } },
        },
      },
    },
  });

  // Calcola progresso per prodotto
  const productProgress = await Promise.all(
    orders.map(async (order) => {
      const lessonIds = await prisma.lesson.findMany({
        where: { productId: order.product.id },
        select: { id: true },
      });
      const total = lessonIds.length;
      const completed = await prisma.lessonProgress.count({
        where: { userId, lessonId: { in: lessonIds.map(l => l.id) }, completed: true },
      });
      return { productId: order.product.id, slug: order.product.slug, total, completed, coverUrl: order.product.coverUrl };
    })
  );

  const allCompleted = productProgress.filter(p => p.total > 0 && p.completed >= p.total);
  const lastLessonTitle = lastWatch?.lesson?.translations?.[0]?.title;
  const resumeLocale = lastWatch?.lesson?.translations?.[0]?.locale ?? lastWatch?.lesson?.product?.defaultLanguage ?? "it";
  const resumeSlug = lastWatch?.lesson?.product?.slug;
  const resumePosition = lastWatch?.lesson?.position;

  return (
    <section className="space-y-8">
      {/* Continue Learning */}
      {lastWatch && (
        <div className="relative overflow-hidden premium-glass rounded-[2.5rem] border border-white/5">
          <div className="absolute -left-32 -top-32 w-80 h-80 bg-accent-tertiary/5 rounded-full blur-[100px]" />
          <div className="absolute -right-32 -bottom-32 w-80 h-80 bg-accent-primary/5 rounded-full blur-[100px]" />
          
          <div className="relative p-10 lg:p-16 text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 premium-glass rounded-full border border-white/5">
              <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
              <span className="text-[10px] font-black text-accent-primary uppercase tracking-widest">
                {lastLessonTitle ? `Ultima lezione: ${lastLessonTitle}` : "Continua da dove hai lasciato"}
              </span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-black text-white text-contrast tracking-tight">
              Continua il tuo percorso
            </h2>
            <p className="text-zinc-500 text-base max-w-lg mx-auto font-medium">
              La costanza è la chiave del successo. Dedica anche solo 15 minuti al giorno e vedrai risultati straordinari.
            </p>
            <Link
              href={resumeSlug && resumePosition ? `/${resumeSlug}/curso/lesson-${resumePosition}?lang=${resumeLocale}` : "/dashboard"}
              className="inline-flex items-center gap-2 glow-btn px-8 py-4 rounded-2xl text-sm font-bold text-white premium-glass"
            >
              <Play className="w-4 h-4" />
              Riprendi da Dove Hai Lasciato
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Certificati Disponibili */}
      {allCompleted.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl lg:text-2xl font-black text-white text-contrast tracking-tight flex items-center gap-3">
            <Award className="w-6 h-6 text-accent-tertiary" />
            Certificati Disponibili
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allCompleted.map((p) => (
              <Link
                key={p.productId}
                href={`/api/certificate/${p.productId}`}
                className="premium-glass p-6 rounded-[1.5rem] border border-white/5 hover:border-accent-tertiary/30 transition-all group flex items-center gap-4"
              >
                <div className="w-14 h-14 premium-glass rounded-xl flex items-center justify-center border border-accent-tertiary/20 group-hover:scale-110 transition-transform">
                  <FileText className="w-6 h-6 text-accent-tertiary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-white capitalize">{p.slug.replace(/-/g, " ")}</h3>
                  <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest mt-1">
                    Scarica Certificato
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-accent-tertiary transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StatCard({ 
  icon, 
  label, 
  value, 
  subtitle 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
  subtitle: string;
}) {
  return (
    <div className="premium-glass p-7 rounded-[2rem] border border-white/5 group hover:border-white/20 transition-all duration-500 relative overflow-hidden">
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all duration-700" />
      
      <div className="flex justify-between items-start relative z-10">
        <span className="text-zinc-500 text-[10px] font-black tracking-[0.2em] uppercase">{label}</span>
        <div className="p-2.5 premium-glass rounded-xl border border-white/5 group-hover:scale-110 transition-transform duration-500 shadow-lg">
          {icon}
        </div>
      </div>
      <div className="mt-8 relative z-10">
        <div className="text-3xl lg:text-4xl font-black text-white text-contrast tracking-tight">{value}</div>
        <div className="text-[10px] text-zinc-500 mt-2 font-bold uppercase tracking-widest">{subtitle}</div>
      </div>
    </div>
  );
}

function CourseCard({
  slug,
  coverUrl,
  templateId,
  lessonCount,
  purchasedAt,
  amount,
  currency,
}: {
  slug: string;
  coverUrl: string | null;
  templateId: string;
  lessonCount: number;
  purchasedAt: Date;
  amount: number;
  currency: string;
}) {
  const currencySymbol = currency === "eur" ? "€" : currency === "usd" ? "$" : "£";

  return (
    <Link
      href={`/${slug}/portal?lang=it`}
      className="group premium-glass rounded-[2rem] overflow-hidden border border-white/5 hover:border-white/20 transition-all duration-500"
    >
      {/* Cover */}
      <div className="aspect-[3/2] bg-gradient-to-br from-zinc-900 to-zinc-800 relative overflow-hidden">
        {coverUrl ? (
          <img 
            src={coverUrl} 
            alt={slug}
            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-700"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-12 h-12 text-zinc-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0c] via-transparent to-transparent" />
        
        {/* Badges */}
        <div className="absolute top-4 left-4 flex gap-2">
          <span className="px-3 py-1 premium-glass rounded-full text-[8px] font-black uppercase tracking-widest border border-white/10 text-zinc-300">
            {templateId}
          </span>
        </div>
        <div className="absolute bottom-4 right-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 premium-glass rounded-full border border-white/5">
            <Play className="w-3 h-3 text-accent-primary" />
            <span className="text-[9px] font-black text-white">{lessonCount} lezioni</span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-6 space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-white text-contrast group-hover:text-accent-primary transition-colors capitalize truncate">
            {slug.replace(/-/g, " ")}
          </h3>
          <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">
            Acquistato il {new Date(purchasedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div className="text-xs font-bold text-zinc-400">
            {currencySymbol}{(amount / 100).toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black text-accent-primary uppercase tracking-widest group-hover:gap-2.5 transition-all">
            Continua <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
