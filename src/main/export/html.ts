import exportCss from '../../renderer/styles/export.css?raw'
import ledgerCss from '../../renderer/styles/themes/ledger.css?raw'
import plateCss from '../../renderer/styles/themes/plate.css?raw'
import tokensCss from '../../renderer/styles/tokens.css?raw'
import { renderMarkdown } from '../../shared/markdown'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface ExportHtmlOptions {
  title: string
  /* Extra CSS appended after the shared sheets (PDF uses this for embedded
   * fonts). */
  extraCss?: string
}

/* Self-contained HTML: styles inlined, body rendered by THE pipeline.
 * Fonts intentionally reference the family names with system fallbacks
 * rather than embedding ~800KB of woff2 into every export; the PDF path
 * embeds real fonts via extraCss. */
export async function renderExportHtml(
  markdown: string,
  options: ExportHtmlOptions
): Promise<string> {
  const body = await renderMarkdown(markdown)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>
${tokensCss}
${ledgerCss}
${plateCss}
${exportCss}
${options.extraCss ?? ''}
</style>
</head>
<body>
<main class="doc">
${body}
</main>
</body>
</html>
`
}
