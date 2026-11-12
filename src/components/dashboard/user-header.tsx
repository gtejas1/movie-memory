import Image from "next/image";
import { signOut } from "@/config/auth";

type UserHeaderProps = {
  name: string | null;
  email: string | null;
  image: string | null;
};

/** Profile summary plus logout. Handles a missing Google name or photo. */
export function UserHeader({ name, email, image }: UserHeaderProps) {
  return (
    <header className="flex items-center gap-4">
      {image ? (
        <Image src={image} alt="" width={48} height={48} className="rounded-full" />
      ) : (
        <div className="size-12 rounded-full bg-neutral-700" />
      )}
      <div>
        <p className="font-medium">{name ?? "Movie fan"}</p>
        <p className="text-sm text-neutral-400">{email}</p>
      </div>
      <form
        className="ml-auto"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800">
          Log out
        </button>
      </form>
    </header>
  );
}
