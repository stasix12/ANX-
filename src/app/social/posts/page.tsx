import { redirect } from 'next/navigation';

/**
 * /social/posts is the content library, and the content library is
 * /social/library.
 *
 * This route used to be a second, fully-built list of the same posts: its own
 * empty state, its own overflow menus and its own delete confirmation, with
 * ZERO inbound links anywhere in src — nothing in the nav, nothing on the
 * dashboard, nothing in the "עוד" sheet. It shipped in every build and was
 * reachable only by typing the URL, which meant it was a second place for the
 * same wording to drift out of step with the screen people actually use (and
 * it already had: two different delete dialogs for one action).
 *
 * A redirect rather than a deletion, because the path is the natural guess,
 * /social/posts/new and /social/posts/[id] both live under it, and an old
 * bookmark or a link in a message should land somewhere rather than 404.
 */
export default function PostsIndexRedirect(): never {
  redirect('/social/library');
}
