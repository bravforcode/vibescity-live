/// <reference types="vite/client" />
/// <reference types="node" />

/**
 * Build-time constants injected by rsbuild source.define
 * @see rsbuild.config.ts
 */
declare const __APP_VERSION__: string;
declare const __VIBECITY_VERSION__: string;

interface ImportMetaEnv {
	readonly [key: string]: any;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
declare module "*.vue" {
	// biome-ignore lint/complexity/noBannedTypes: Vue DefineComponent standard type declaration
	const component: import("vue").DefineComponent<{}, {}, any>;
	export default component;
}

declare module "vue-router";
declare module "vue-i18n";
declare module "lucide-vue-next";
declare module "promptpay-qr";
declare module "qrcode.vue";
declare module "canvas-confetti";
