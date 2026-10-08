import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** يضمن أن المسار الأساسي يبدأ وينتهي بشرطة مائلة، مثال: '/' أو '/family-tree/' */
function normalizeBase(value: string) {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

/**
 * المسار الأساسي للنشر:
 * - Vercel وأي استضافة على جذر النطاق: '/' (الافتراضي)
 * - GitHub Pages لمستودع: '/<اسم-المستودع>/' يُكتشف تلقائيًا داخل GitHub Actions
 * يمكن دائمًا التجاوز الصريح عبر متغير البيئة VITE_BASE_PATH، مثال:
 *   VITE_BASE_PATH=/family-tree/ pnpm build
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const repoName = (env.GITHUB_REPOSITORY || '').split('/').filter(Boolean)[1];
  const detectedBase = env.GITHUB_ACTIONS === 'true' && repoName ? `/${repoName}/` : '/';
  const base = normalizeBase(env.VITE_BASE_PATH || detectedBase);

  /** يبني مسارًا مطلقًا متوافقًا مع المسار الأساسي، مثال: '/icons/icon.svg' أو '/family-tree/icons/icon.svg' */
  const asset = (path: string) => `${base}${path.replace(/^\/+/, '')}`;

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'شجرة العائلة',
          short_name: 'العائلة',
          description: 'إدارة شجرة عائلتك محليًا',
          lang: 'ar',
          dir: 'rtl',
          display: 'standalone',
          start_url: base,
          scope: base,
          theme_color: '#274a6d',
          background_color: '#f4f1ea',
          icons: [{ src: asset('icons/icon.svg'), sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
        },
        workbox: { globPatterns: ['**/*.{js,css,html,svg}'] },
      }),
    ],
    // السماح بمضيفات بيئات المعاينة السحابية أثناء التطوير فقط
    server: { host: '0.0.0.0', port: 3000, allowedHosts: ['.e2b.app', '.vercel.app', 'localhost'] },
    preview: { host: '0.0.0.0', port: 3000, allowedHosts: ['.e2b.app', '.vercel.app', 'localhost'] },
  };
});
