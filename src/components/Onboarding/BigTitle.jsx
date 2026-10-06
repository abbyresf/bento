/* A headline set huge, one word at a time.
 *
 * Each word sits in its own clipping box and rises into it from below, with a
 * small overshoot, one after another. The last word is set in the brand orange.
 * It is the same technique as the title cards in Nike and Spotify Wrapped
 * pieces: the type is the graphic.
 *
 * Words are separate elements, so it is built from the text rather than being
 * a styled <h2>. The full text stays readable by screen readers through the
 * aria-label, and the pieces are hidden from them. */
export default function BigTitle({ text }) {
  const words = text.split(' ');
  return (
    <h2 className="big-title" aria-label={text}>
      {words.map((w, i) => (
        <span className="bt-clip" key={i} aria-hidden="true">
          <span
            className={`bt-word${i === words.length - 1 ? ' accent' : ''}`}
            style={{ '--w': i }}
          >
            {w}
          </span>
        </span>
      ))}
    </h2>
  );
}
