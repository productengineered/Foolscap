/* Vite ?raw imports used by the export modules to inline stylesheets. */
declare module '*?raw' {
  const content: string
  export default content
}
