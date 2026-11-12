import { signIn } from "@/config/auth";

export function GoogleSignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/dashboard" });
      }}
    >
      <button className="rounded-lg bg-white px-5 py-2.5 font-medium text-black hover:bg-neutral-200">
        Sign in with Google
      </button>
    </form>
  );
}
