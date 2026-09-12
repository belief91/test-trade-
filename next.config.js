/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // FIX (10/09) : sans ceci, prompts/*.txt lus via fs.readFileSync()
    // dans lib/module-synthesis-service.js fonctionnent en local mais
    // peuvent être absents du bundle serverless Vercel en production.
    outputFileTracingIncludes: {
      "/api/**": ["./prompts/**/*"],
    },
  },
};

module.exports = nextConfig;
