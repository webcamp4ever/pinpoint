import { NextResponse } from 'next/server';
// 1. 최신 Supabase 서버 유틸리티 가져오기
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  // URL에서 인증 코드(code)를 찾습니다.
  const code = searchParams.get('code');
  
  if (code) {
    // 2. 쿠키 저장소를 가져옵니다. (Next.js 최신 버전 대응을 위해 await 사용)
    const cookieStore = await cookies();

    // 3. 서버 환경에서 동작하는 Supabase 클라이언트를 만듭니다.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) {
            return cookieStore.get(name)?.value;
          },
          set(name, value, options) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name, options) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    // 4. 가져온 코드를 진짜 로그인 세션으로 교환합니다.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('🔴 세션 교환 에러:', error);
      return NextResponse.redirect(`${origin}/auth/auth-code-error`);
    }
  }

  // 5. 모든 처리가 끝나면 메인 페이지로 이동합니다.
  return NextResponse.redirect(`${origin}`);
}