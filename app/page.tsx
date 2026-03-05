import { createClient } from '../utils/supabase/server';
import { redirect } from 'next/navigation';
import LoginButton from '../components/login-button';
import MapView from '../components/map-view'; // 👈 1. 여기서 지도를 가져와서

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const signOut = async () => {
    'use server';
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/');
  };

  return (
    <div style={{ padding: '50px', textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Pinpoint 📍</h1>
      
      {/* 로그인 여부에 따라 다른 화면 보여주기 */}
      {user ? (
        <div>
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p><strong>{user.email}</strong>님, 환영합니다!</p>
            <form action={signOut}>
              <button style={{ padding: '8px 16px', cursor: 'pointer', background: '#ff4444', color: 'white', border: 'none', borderRadius: '4px' }}>
                로그아웃
              </button>
            </form>
          </div>

          {/* 👈 2. 여기에 지도를 배치합니다! */}
          <MapView />
          
        </div>
      ) : (
        <div style={{ background: '#f9f9f9', padding: '40px', borderRadius: '10px' }}>
          <p style={{marginBottom: '20px'}}>나만의 지도를 만들려면 로그인하세요.</p>
          <LoginButton />
        </div>
      )}
    </div>
  );
}