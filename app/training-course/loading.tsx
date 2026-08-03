export default function TrainingCourseLoading() {
  return (
    <main className="min-h-screen bg-[#0c0a09] px-5 py-24 text-[#f3eadf] lg:px-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-3 w-52 rounded bg-[#44372e]" />

        <div className="mt-7 h-16 max-w-3xl rounded bg-[#211a16]" />
        <div className="mt-3 h-16 max-w-2xl rounded bg-[#211a16]" />

        <div className="mt-8 h-5 max-w-xl rounded bg-[#332a24]" />
        <div className="mt-3 h-5 max-w-lg rounded bg-[#332a24]" />

        <div className="mt-10 flex gap-3">
          <div className="h-12 w-52 rounded-md bg-[#765b3e]" />
          <div className="h-12 w-40 rounded-md bg-[#29211b]" />
        </div>

        <div className="mt-20 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-64 rounded-2xl border border-[#332a24] bg-[#171310]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}