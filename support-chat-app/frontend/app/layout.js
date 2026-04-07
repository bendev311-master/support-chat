import './globals.css'

export const metadata = {
  title: 'Multi-Vendor Support Chat',
  description: 'Premium customer support system',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
