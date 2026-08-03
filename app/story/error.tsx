'use client';

export default function Error({ error }: { error: Error }) {
  return (
    <div className="p-10 text-white bg-black min-h-screen">
      <h2>Something went wrong</h2>
      <pre className="text-red-400 text-sm mt-4">{error.message}</pre>
    </div>
  );
}