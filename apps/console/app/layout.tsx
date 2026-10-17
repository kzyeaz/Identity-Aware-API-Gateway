import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Identity / Gateway Console",
  description: "An identity-aware API gateway demo. Explore verified access, rate limiting, and observable requests.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
