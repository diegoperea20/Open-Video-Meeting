import Video from '@/components/Video.js';

export default function VideoPage({ params }) {
  return <Video url={params.url} />;
}