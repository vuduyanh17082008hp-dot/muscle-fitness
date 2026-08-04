import { Hero } from "@/components/landing/hero";
import { Method } from "@/components/landing/method";
import { Pricing } from "@/components/landing/pricing";
import { Programs } from "@/components/landing/programs";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <Hero />
      <Method />
      <Programs />
      <Pricing />
      <SiteFooter />
    </>
  );
}
