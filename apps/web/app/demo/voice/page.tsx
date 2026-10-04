import type { Metadata } from 'next';
import { VoiceDemo } from '@/components/demo/VoiceDemo';

export const metadata: Metadata = {
  title: 'Voice Agent Demo',
  description:
    'Try a Nivomi voice agent in your browser. Hold to speak, release to hear the reply.',
  robots: { index: false, follow: false },
};

export default function VoiceDemoPage() {
  return <VoiceDemo />;
}
