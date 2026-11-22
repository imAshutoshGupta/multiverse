import type { Metadata } from "next";
import { ThemeStyle } from "@/components/brand/ThemeStyle";
import { Landing } from "@/components/book/Landing";
import { SetupNotice } from "@/components/SetupNotice";
import { getPublicCatalog, isCatalog } from "@/lib/publicCatalog";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPublicCatalog();
  if (!isCatalog(c)) return { title: "Book a slot" };
  return {
    title: { absolute: `${c.settings.cafe_name} · Book a slot` },
    description: c.settings.about || `Book your slot at ${c.settings.cafe_name}, ${c.settings.address}.`,
    openGraph: c.settings.hero_image_url ? { images: [c.settings.hero_image_url] } : undefined,
    icons: c.settings.logo_url ? { icon: c.settings.logo_url, apple: c.settings.logo_url } : undefined,
  };
}

export default async function BookPage() {
  const catalog = await getPublicCatalog();
  if (!isCatalog(catalog)) return <SetupNotice problem={catalog} />;
  return (
    <>
      <ThemeStyle theme={catalog.settings} />
      <Landing catalog={catalog} />
    </>
  );
}
