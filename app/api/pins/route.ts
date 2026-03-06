import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server'; // 💡 프로젝트의 실제 경로에 맞게 필요시 수정해 주세요.

// ==========================================
// [GET] 내 핀 목록 불러오기
// ==========================================
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('pins')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error('Supabase GET Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('API GET Error:', err);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}

// ==========================================
// [POST] 핀 저장하기 (Insert)
// ==========================================
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();

    const pinData = {
      user_id: user.id,                      
      place_id: body.id || body.place_id,    
      lat: body.lat,                         
      lng: body.lng,                         
      title: body.name || body.title,        
      address: body.address || null,
      memo: body.memo || null,
    };

    const { data, error } = await supabase
      .from('pins')
      .insert([pinData])
      .select() 
      .single();

    if (error) {
      console.error('Supabase POST Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error('API POST Error:', err);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}

// ==========================================
// [DELETE] 핀 삭제하기
// ==========================================
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const placeId = searchParams.get('placeId'); 
    const pinId = searchParams.get('id');        

    let query = supabase.from('pins').delete().eq('user_id', user.id); 

    // UUID 형식인지 확인하는 정규식
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (pinId && uuidRegex.test(pinId)) {
      // pinId가 들어왔고 정상적인 UUID 형태일 경우 (DB id 기준 삭제)
      query = query.eq('id', pinId);
    } else if (pinId && !uuidRegex.test(pinId)) {
      // id 파라미터로 들어왔지만 일반 문자열(Place ID) 형태일 경우 (자동 보정)
      query = query.eq('place_id', pinId);
    } else if (placeId) {
      // placeId 파라미터로 정확히 들어온 경우
      query = query.eq('place_id', placeId);
    } else {
      return NextResponse.json({ error: '삭제할 핀의 ID가 필요합니다.' }, { status: 400 });
    }

    const { error } = await query;

    if (error) {
      console.error('Supabase DELETE Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: '삭제 성공' }, { status: 200 });
  } catch (err) {
    console.error('API DELETE Error:', err);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}

// ==========================================
// [PUT] 핀 수정하기 (Update)
// ==========================================
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();

    // 수정하려면 데이터베이스의 고유 id가 필요합니다.
    if (!body.id) {
      return NextResponse.json({ error: '수정할 핀의 ID가 필요합니다.' }, { status: 400 });
    }

    // 서버 콘솔에 값 찍어보기 (터미널에서 확인 가능)
    console.log("✅ [PUT] 받은 데이터:", body);
    console.log("✅ [PUT] 현재 유저 ID:", user.id);

    // 수정할 데이터 (보통 메모나 제목을 수정합니다)
    const updateData = {
      title: body.name || body.title,        
      memo: body.memo || null,
    };

    const { data, error } = await supabase
      .from('pins')
      .update(updateData)
      .eq('id', body.id)         // 해당 핀 ID를 찾아
      .eq('user_id', user.id)    // 본인의 핀인지 확인 후 업데이트
      .select();
      //.single();

    if (error) {
      console.error('Supabase PUT Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

 // 업데이트된 데이터가 없는 경우 (0 rows) 에러 처리
    if (!data || data.length === 0) {
      console.error("❌ 업데이트된 항목이 없습니다. ID 오류 또는 Supabase RLS 정책 확인 필요!");
      return NextResponse.json(
        { error: '업데이트할 권한이 없거나, 해당 핀을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 성공 시 첫 번째 데이터 반환
    return NextResponse.json(data[0], { status: 200 });
  } catch (err) {
    console.error('API PUT Error:', err);
    return NextResponse.json({ error: '서버 에러가 발생했습니다.' }, { status: 500 });
  }
}

