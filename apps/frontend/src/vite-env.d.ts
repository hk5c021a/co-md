// VitePlus client types — 替代 vite/client (vite 已 override 到 @voidzero-dev/vite-plus-core)
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_DEV: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare var Temporal: any;
