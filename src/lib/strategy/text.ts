/** Confluence storage-format XHTML → readable plain text that keeps structure. */
export function storageToText(html: string): string {
  return html
    .replace(/<ac:structured-macro[^>]*ac:name="(toc|children|jira)"[\s\S]*?<\/ac:structured-macro>/g, "")
    // Macro settings (e.g. a panel's <ac:parameter>false</ac:parameter>) are not page text.
    .replace(/<ac:parameter\b[^>]*>[\s\S]*?<\/ac:parameter>/g, "")
    .replace(/<h([1-6])[^>]*>/g, (_, n) => `\n\n${"#".repeat(Number(n))} `)
    .replace(/<\/h[1-6]>/g, "\n")
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<(br|\/p|\/tr|\/div|\/blockquote)[^>]*>/g, "\n")
    .replace(/<\/t[dh]>/g, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
