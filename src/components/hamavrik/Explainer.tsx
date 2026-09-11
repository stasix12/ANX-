import { Reveal } from '@/components/hamavrik/Reveal';
import { explainer } from '@/lib/hamavrik/config';

/**
 * The long-form professional explainer — the page's SEO body copy, written
 * to be read: one question per block, plain answers, no keyword stuffing.
 * Two columns on desktop so it never turns into a wall of text.
 */
export function Explainer() {
  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
      {explainer.map((block, i) => (
        <Reveal as="article" key={block.title} delay={(i % 2) * 90} className="border-s-4 border-brand-300 ps-5">
          <h3 className="text-xl font-black">{block.title}</h3>
          <p className="mt-2 leading-relaxed text-mist-300">{block.body}</p>
        </Reveal>
      ))}
    </div>
  );
}
