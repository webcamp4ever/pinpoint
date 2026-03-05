import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  // 세션(쿠키)을 갱신하고 헤더에 실어주는 역할을 합니다.
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * 아래 경로들을 제외하고 모든 경로에서 미들웨어가 실행됩니다:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images 등 정적 폴더
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}