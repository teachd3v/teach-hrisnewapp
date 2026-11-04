export default function Login() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">HRIS TEACH</h1>
      <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
        <input className="rounded border p-2" type="email" placeholder="Email" autoComplete="username" />
        <input className="rounded border p-2" type="password" placeholder="Password" autoComplete="current-password" />
        <button className="rounded bg-black p-2 text-white" type="submit">Masuk</button>
      </form>
      <p className="text-sm text-gray-500">Login token belum terhubung ke API.</p>
    </main>
  );
}
