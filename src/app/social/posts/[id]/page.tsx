import { Suspense } from 'react';
import { PostEditor } from '@/components/social/PostEditor';

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <PostEditor postId={id} />
    </Suspense>
  );
}
