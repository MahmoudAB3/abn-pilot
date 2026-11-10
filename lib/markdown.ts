import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

/**
 * Description et commentaires en Markdown, rendus côté serveur puis assainis (anti-XSS).
 * Les mentions @[Nom](id) deviennent des badges ; les liens externes s'ouvrent en nouvel onglet.
 */
marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(src: string): string {
  if (!src.trim()) return "";
  const withMentions = src.replace(/@\[([^\]]{1,80})\]\(([a-z0-9]{20,40})\)/g, (_m, name: string) => `<span class="mention">@${name.replace(/[<>&"]/g, "")}</span>`);
  const html = marked.parse(withMentions, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "del", "code", "pre", "blockquote", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "hr", "table", "thead", "tbody", "tr", "th", "td", "span", "input"],
    ALLOWED_ATTR: ["href", "title", "class", "type", "checked", "disabled"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  }).replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow"');
}
