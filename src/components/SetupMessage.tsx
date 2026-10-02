export function SetupMessage({ message }: { message: string }) {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-3xl font-semibold">The movie catalog isn&apos;t set up yet</h1>
      <p className="text-muted">{message}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Build it with <code>python build_catalog.py path/to/ml-32m</code>.</li>
        <li>Copy the resulting <code>catalog.db</code> to <code>data/catalog.db</code> in this project.</li>
        <li>Reload this page.</li>
      </ol>
    </main>
  );
}
