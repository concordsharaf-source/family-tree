import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({ plugins:[react(), VitePWA({ registerType:'autoUpdate', manifest:{ name:'شجرة العائلة', short_name:'العائلة', description:'إدارة شجرة عائلتك محليًا', lang:'ar', dir:'rtl', display:'standalone', start_url:'/', theme_color:'#365b4d', background_color:'#f7f4ee', icons:[{src:'/icons/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}] }, workbox:{globPatterns:['**/*.{js,css,html,svg}']}})], server:{host:'0.0.0.0',port:3000} });
