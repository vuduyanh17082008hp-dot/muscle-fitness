import { NextResponse } from 'next/server';
export async function POST(request: Request) {
  const { goal } = await request.json();
  return NextResponse.json({
    plan: `AI Plan for ${goal}: Day1: Squat 3x10, Push-up 3x12... Day2: Rest...`,
  });
}