// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// 👇 범인 색출을 위한 로그 (F12 콘솔에서 확인)
console.log('--- 환경변수 체크 ---');
console.log('URL:', supabaseUrl);
console.log('KEY:', supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey); 