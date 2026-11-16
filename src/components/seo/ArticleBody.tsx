import type { Block } from '@/lib/seo/types';

/**
 * Renders a generated article body.
 *
 * Every string here lands as a React text node — there is no
 * dangerouslySetInnerHTML, no markdown parser and no HTML sanitiser, because
 * there is no HTML to sanitise. React escapes the text, so generated content
 * cannot introduce a tag, a script or an attribute no matter what the model
 * produced. This is the whole reason bodies are stored as structured blocks
 * rather than as markdown or HTML.
 *
 * Headings start at h2: the page's single h1 is rendered by the page itself.
 */
export function ArticleBody({ body }: { body: Block[] }) {
  return (
    <div className="space-y-5">
      {body.map((block, i) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={i} className="mt-10 text-2xl font-black text-mist-100 sm:text-3xl">
                {block.text}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={i} className="mt-6 text-lg font-extrabold text-mist-100 sm:text-xl">
                {block.text}
              </h3>
            );
          case 'ul':
            return (
              <ul key={i} className="space-y-2.5 ps-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3 leading-relaxed text-mist-300">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} className="text-[1.0625rem] leading-[1.9] text-mist-300">
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}
