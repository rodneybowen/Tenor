// Slow-drifting aurora blobs. Pure decoration — texture, not color.
export default function BlobField() {
  return (
    <div className="blobs" aria-hidden="true">
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
      <div className="blob blob-d" />
    </div>
  );
}
