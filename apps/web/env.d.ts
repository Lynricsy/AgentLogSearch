declare namespace NodeJS {
  interface ProcessEnv {
    readonly API_PROXY_TARGET?: string
    readonly NEXT_PUBLIC_API_BASE_URL?: string
  }
}
