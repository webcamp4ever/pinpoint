'use client'; // 이 줄이 필수입니다!

import { createClient } from '@/utils/supabase/client'; // 방금 만든 파일 import

export default function LoginButton() {
  const handleLogin = async () => {
    const supabase = createClient();
    
    // 구글 로그인 실행
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // 로그인 끝나면 아까 만든 callback 라우트로 돌아오게 함
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  };

  return (
    <button
      onClick={handleLogin}
      style={{
        padding: '12px 24px',
        fontSize: '16px',
        backgroundColor: '#4285F4', // 구글 파란색
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        marginTop: '10px'
      }}
    >
      Google 계정으로 로그인
    </button>
  );
}