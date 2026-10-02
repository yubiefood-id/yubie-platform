import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { recipes } from "@yubie/domain";

export const metadata: Metadata = {
  title: "Recipes",
  robots: { index: false, follow: true },
};

export function generateStaticParams() { return recipes.map((recipe) => ({ slug: recipe.slug })); }

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  await params;
  permanentRedirect("/our-roots#everyday-use");
}
