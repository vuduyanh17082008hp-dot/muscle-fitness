import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const loose = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<{
            data: unknown[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };

  const { data, error } = await loose
    .from("exercise_library")
    .select("id, name, slug, muscle_group, equipment, difficulty")
    .order("name", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    exercises: data ?? [],
  });
}
