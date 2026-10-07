import type { Metadata } from "next";
import { StoryExperience } from "@/components/story/story-experience";

export const metadata: Metadata = {
  title: "Our Story",
  description: "Cerita Yubie—dari ubi Indonesia menuju pangan modern, pendidikan bahan, dokumentasi bukti, dan tim lintas disiplin di baliknya.",
  alternates: { canonical: "/our-story" },
  openGraph: {
    title: "Our Story · Yubie",
    description: "Yang tumbuh dekat, layak punya masa depan besar.",
    images: ["/story/team-yubie.webp"],
  },
};

export default function OurStoryPage() {
  return <StoryExperience />;
}
