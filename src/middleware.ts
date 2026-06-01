import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SUPPORTED_LOCALES = ['it', 'en', 'es', 'fr', 'de', 'pt'];
const DEFAULT_LOCALE = 'it';

export function middleware(request: NextRequest) {
  // 1. Check if there's a locale in search params (manual override)
  const { searchParams } = new URL(request.url);
  const langParam = searchParams.get('lang');
  
  // 2. Check if there's already a cookie
  const cookieLocale = request.cookies.get('locale')?.value;

  let locale = DEFAULT_LOCALE;

  if (langParam && SUPPORTED_LOCALES.includes(langParam)) {
    locale = langParam;
  } else if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
    locale = cookieLocale;
  } else {
    // 3. Auto-detect from headers
    const acceptLanguage = request.headers.get('accept-language');
    const country = request.headers.get('x-vercel-ip-country')?.toLowerCase();

    // Map country to locale
    if (country) {
      const countryMap: Record<string, string> = {
        it: 'it',
        es: 'es',
        mx: 'es',
        ar: 'es',
        fr: 'fr',
        de: 'de',
        br: 'pt',
        pt: 'pt',
        us: 'en',
        gb: 'en',
        ca: 'en',
        au: 'en',
      };
      if (countryMap[country]) {
        locale = countryMap[country];
      }
    } else if (acceptLanguage) {
      // Parse accept-language (e.g., "en-US,en;q=0.9,it;q=0.8")
      const preferredLocale = acceptLanguage
        .split(',')[0]
        .split('-')[0]
        .toLowerCase();
      
      if (SUPPORTED_LOCALES.includes(preferredLocale)) {
        locale = preferredLocale;
      }
    }
  }

  const response = NextResponse.next();

  // Set the cookie if it's different or missing
  if (cookieLocale !== locale) {
    response.cookies.set('locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  // Match all paths except static files, api, etc.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
