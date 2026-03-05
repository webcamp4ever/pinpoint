import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ message: "성공! 경로는 살아있다!" });
}