/**
 * Banner of the handle in use, sitting directly under the header.
 *
 * Edge to edge on phones, but pulled into the content column from sm up. The
 * footage was shot in portrait on a phone, so it is only 1080px wide: stretched
 * across a 1440px desktop it gets scaled up a third and the framing closes right
 * in on the nozzle. Held to the column it renders at roughly native size and
 * keeps the hand, the tool and the mattress all in shot.
 *
 * Autoplay only works muted, and iOS additionally needs playsInline or it takes
 * the video fullscreen on play. The poster holds the first frame so the strip is
 * never blank while the file loads.
 *
 * Two sources on purpose: Safari and iOS need the H.264 MP4, while Chrome and
 * Firefox take the smaller VP9 WebM listed first. The original phone file was
 * HEVC, which neither Chrome nor Firefox decodes, so it could not be used as-is.
 */
export function DemoVideo() {
  return (
    <div className="mx-auto w-full max-w-6xl sm:px-6">
      <div className="relative h-[200px] w-full overflow-hidden bg-ink-900 sm:h-[340px] sm:rounded-card lg:h-[420px]">
        <video
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/video/anx-demo-poster.jpg"
          aria-label="ידית השאיבה של ANX3D מנקה מזרן"
        >
          <source src="/video/anx-demo.webm" type="video/webm" />
          <source src="/video/anx-demo.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  );
}
