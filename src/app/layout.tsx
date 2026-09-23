import type { Metadata } from 'next';
import { Kanit } from 'next/font/google';
import './globals.css';
import AccessGate from './AccessGate';

const kanit = Kanit({ 
  subsets: ['latin', 'thai'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Live Prize Draw',
  description: 'Live Prize Lucky Draw Interface',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className={kanit.className}>
        <AccessGate>{children}</AccessGate>
      </body>
    </html>
  );
}
