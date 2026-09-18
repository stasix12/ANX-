import { Suspense } from 'react';
import { PostEditor } from '@/components/social/PostEditor';

export default function NewPostPage() {
  return (
    <Suspense fallback={null}>
      <PostEditor />
    </Suspense>
  );
}
