export { auth as middleware } from "@/config/auth";

export const config = { matcher: ["/dashboard/:path*", "/onboarding/:path*"] };
