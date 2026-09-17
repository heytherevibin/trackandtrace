/** The line between sections: twin rails and sleepers, never a plain hairline. */
export function TrackDivider() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-page px-4 sm:px-6">
      <div className="track-h h-2" />
    </div>
  );
}
