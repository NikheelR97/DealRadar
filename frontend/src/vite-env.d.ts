/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_ADS?: string;
  readonly VITE_KOFI_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
