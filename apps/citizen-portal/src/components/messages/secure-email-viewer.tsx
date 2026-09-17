"use client"

// frame-ancestors deliberately omitted: per CSP3 spec it is ignored when
// delivered via <meta>, and the parent app already enforces framing
// protection via X-Frame-Options/CSP HTTP headers (nginx).
const CSP_HEADER = `
  default-src 'none';
  style-src 'unsafe-inline';
  img-src https: data:;
  object-src 'none';
  base-uri 'none';
  form-action 'none';
  frame-src 'none';
`.replace(/\n/g, "")

export function SecureEmailViewer({ content }: { content: string }) {
  const srcDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-Content-Type-Options" content="nosniff">
  <meta http-equiv="Referrer-Policy" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${CSP_HEADER}">
  <style>
    body {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      max-width: 100%;
      overflow-x: hidden;
      font-family: Lato, Arial, sans-serif;
      font-size: 1rem;
      line-height: 1.35;
      color: #0b0c0c;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }
    p { margin: 0 0 0.5rem; }
    p:last-child { margin-bottom: 0; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>${content}</body>
</html>`

  return (
    <iframe
      style={{ width: "100%", height: "min(30rem, 50vh)", border: "none" }}
      sandbox=''
      title='Secure email content viewer'
      referrerPolicy='no-referrer'
      srcDoc={srcDoc}
    />
  )
}
