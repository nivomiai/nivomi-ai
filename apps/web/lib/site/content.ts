/**
 * Public-site navigation shared by the React pages (legal, Coming Soon). It mirrors the header
 * and footer of the homepage, the static page from the nivomiai/website repo
 * (`public/site/home.html`), so every public page reads as one site. Section links point into
 * that page, which is not a Next.js route: render them as plain anchors, never `<Link>`.
 */
import { siteConfig } from './config';

export interface NavItem {
  readonly label: string;
  readonly href: string;
  /** Opens in a new tab (WhatsApp, external site). */
  readonly external?: boolean;
}

export const primaryNav: readonly NavItem[] = [
  { label: 'AI Managers', href: '/#managers' },
  { label: 'Solutions', href: '/#solutions' },
  { label: 'Industries', href: '/#industries' },
  { label: 'How It Works', href: '/#how' },
  { label: 'Integrations', href: '/#integrations' },
  { label: 'Plans', href: '/#plans' },
];

/** Same pre-filled enquiry as the homepage's WhatsApp buttons. */
export const whatsappEnquiryHref = `https://wa.me/${siteConfig.contact.whatsapp}?text=${encodeURIComponent(
  'Hi NIVOMI AI, I would like to know more about your AI Manager solutions.',
)}`;

export const footerColumns: readonly { readonly title: string; readonly links: NavItem[] }[] = [
  {
    title: 'NIVOMI AI',
    links: [
      { label: 'AI Managers', href: '/#managers' },
      { label: 'Solutions', href: '/#solutions' },
      { label: 'Industries', href: '/#industries' },
      { label: 'Plans', href: '/#plans' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'How It Works', href: '/#how' },
      { label: 'Integrations', href: '/#integrations' },
      { label: 'About', href: '/#about' },
      { label: 'Contact', href: '/#contact' },
    ],
  },
  {
    title: 'Contact',
    links: [
      { label: 'WhatsApp', href: whatsappEnquiryHref, external: true },
      { label: siteConfig.contact.phoneDisplay, href: siteConfig.contact.phoneHref },
      { label: 'Email', href: `mailto:${siteConfig.contact.email}` },
      { label: 'www.nivomi.ai', href: siteConfig.url, external: true },
    ],
  },
];
