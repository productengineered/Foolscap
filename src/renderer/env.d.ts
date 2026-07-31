declare module '*.css'

declare module '*.md?raw' {
  const content: string
  export default content
}

interface Window {
  foolscap: import('../shared/types').FoolscapApi
}
