import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Recipes",
  robots: { index: false, follow: true },
};

export default function RecipesPage() {
  permanentRedirect("/our-roots#everyday-use");
}
