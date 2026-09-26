import type { Metadata } from 'next';
import { Business, Calls, Contact, Data, Hero, Product } from '@/components/marketing/sections';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <Product.Problem />
      <Product.HowItWorks />
      <Product.Capabilities />
      <Product.VoiceWorkflow />
      <Calls.Outbound />
      <Calls.Inbound />
      <Calls.Escalation />
      <Data.DataSources />
      <Data.Languages />
      <Business.Roadmap />
      <Business.UseCases />
      <Business.Pricing />
      <Business.Integrations />
      <Business.Trust />
      <Contact />
    </>
  );
}
