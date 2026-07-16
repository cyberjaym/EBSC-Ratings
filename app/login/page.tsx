import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main style={{ maxWidth: 360, margin: "80px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 20 }}>Sign in</h1>
      {error && <p style={{ color: "#c0392b", fontSize: 13 }}>{error}</p>}
      <form action={login} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          Email
          <input name="email" type="email" required style={{ padding: 8, fontSize: 14 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          Password
          <input name="password" type="password" required style={{ padding: 8, fontSize: 14 }} />
        </label>
        <button type="submit" style={{ padding: 10, fontSize: 14, cursor: "pointer" }}>
          Sign in
        </button>
      </form>
    </main>
  );
}
