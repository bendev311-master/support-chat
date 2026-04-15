import './globals.css'
import { BrandingProvider } from './branding'

export const metadata = {
  title: 'Clarion Stream | Hỗ trợ Khách hàng',
  description: 'Nền tảng hỗ trợ khách hàng cao cấp — Chat trực tuyến, quản lý đội ngũ, giám sát chất lượng dịch vụ.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#005eb6" />
      </head>
      <body>
        <BrandingProvider>
          {children}
        </BrandingProvider>
      </body>
    </html>
  )
}
