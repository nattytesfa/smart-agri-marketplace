import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '../components/Toast';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AgriDirect Admin',
    template: '%s · AgriDirect Admin',
  },
  description:
    'Administration console for the AgriDirect smart agricultural marketplace.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#064e3b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
