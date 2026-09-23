import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    // A15 — docs/auditoria/AUDITORIA-ANTAGONICA-2026-09-17.md
    //
    // Origens externas realmente usadas pelo app:
    //   Mercado Pago         — checkout transparente (Brick), ver mercadoPago abaixo
    //   accounts.google.com  — Google Identity Services (login)
    //   *.supabase.co        — banco, auth e storage
    //
    // TRADE-OFF DECLARADO: 'unsafe-inline' em script-src continua presente
    // porque a hidratação do App Router injeta scripts inline. Retirá-lo exige
    // CSP por nonce no middleware, o que muda o caminho de renderização de toda
    // requisição — trabalho de uma onda própria, não de um ajuste de header.
    // Com isso, esta CSP bloqueia script de origem externa, clickjacking,
    // sequestro de formulário e injeção de <base>, mas NÃO bloqueia XSS inline.
    // Não a apresente como proteção contra XSS.
    //
    // O formulário de cartão NÃO vive só em sdk.mercadopago.com: o SDK baixa o
    // Brick de http2.mlstatic.com, abre os campos do cartão em iframes de
    // secure-fields.mercadopago.com, chama api.mercadopago.com e
    // api-static.mercadopago.com, e o antifraude fala com www.mercadolibre.com
    // e www.mercadolivre.com. Com só o sdk.* liberado (17/09 a 23/09/2026) o
    // formulário ficava girando para sempre, sem erro na tela. Os hosts mudam
    // sem aviso entre versões do Brick, por isso o curinga por domínio da
    // empresa, e não host a host. Nenhum deles precisa de 'unsafe-eval'.
    const mercadoPago = [
      "https://*.mercadopago.com",
      "https://*.mercadopago.com.br",
      "https://*.mlstatic.com",
      "https://*.mercadolibre.com",
      "https://*.mercadolivre.com",
      "https://*.mercadolivre.com.br",
    ].join(" ");

    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${mercadoPago} https://accounts.google.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.mlstatic.com",
      "font-src 'self' data: https://fonts.gstatic.com https://*.mlstatic.com",
      `img-src 'self' data: blob: https://*.supabase.co https://lh3.googleusercontent.com ${mercadoPago}`,
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co ${mercadoPago}`,
      `frame-src ${mercadoPago} https://accounts.google.com`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            // Dados clínicos sob CFP/LGPD nunca devem trafegar em texto claro,
            // nem na primeira requisição depois de um link http://.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // app.psisetting.com.br é o sistema, não a vitrine: nada dele deve
        // aparecer no Google nem competir com www.psisetting.com.br — login,
        // termos e privacidade respondem nos dois hosts. O noindex só funciona
        // se o robô conseguir ler a página, por isso o robots.txt continua
        // liberando o rastreamento.
        source: "/:path*",
        has: [{ type: "host", value: "app.psisetting.com.br" }],
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
