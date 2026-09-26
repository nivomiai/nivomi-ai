import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComingSoonPage } from '@/components/marketing/coming-soon/ComingSoonPage';
import { comingSoonProducts, getComingSoonProduct } from '@/lib/site/coming-soon';

interface Props {
  readonly params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return comingSoonProducts.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getComingSoonProduct(slug);
  if (!product) return {};
  const url = `/coming-soon/${product.slug}`;
  return {
    title: { absolute: product.seoTitle },
    description: product.description,
    alternates: { canonical: url },
    openGraph: { title: product.seoTitle, description: product.description, url },
    twitter: { title: product.seoTitle, description: product.description },
  };
}

export default async function ComingSoonRoute({ params }: Props) {
  const { slug } = await params;
  const product = getComingSoonProduct(slug);
  if (!product) notFound();
  return <ComingSoonPage product={product} />;
}
