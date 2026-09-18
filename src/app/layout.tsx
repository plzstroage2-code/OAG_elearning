import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'ICTC e-Learning · Lucky Draw',description:'เวทีสุ่มผู้โชคดี ICTC e-Learning',icons:{icon:'/favicon.svg'},robots:{index:false,follow:false}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>;}
