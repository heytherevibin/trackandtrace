/** The four "+" registration marks every blueprint object wears. Parent must be `blueprint` (or relative). */
export function Corners() {
  return (
    <>
      <i aria-hidden="true" className="corner corner-tl" />
      <i aria-hidden="true" className="corner corner-tr" />
      <i aria-hidden="true" className="corner corner-bl" />
      <i aria-hidden="true" className="corner corner-br" />
    </>
  );
}
