import './globals.css';
import './themes.css';
export const metadata = { title: 'Lead Manager' };
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#f7f8ef', viewportFit: 'cover' };
export default function RootLayout({ children }) {
  return <html lang="en" data-theme="sage" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: `(function(){var t='sage';try{if(localStorage.getItem('lead-manager-theme')==='graphite')t='graphite'}catch(e){}document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='graphite'?'#12212b':'#f7f8ef')})();` }}/></head><body>{children}</body></html>;
}
