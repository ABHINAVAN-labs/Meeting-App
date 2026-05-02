export default function InteractiveBackground() {
  return (
    <div className="animated-background" aria-hidden="true">
      <div className="image-theme-layer" />
      <div className="background-depth" />
      <div className="ambient-color ambient-color-one" />
      <div className="ambient-color ambient-color-two" />
      <div className="ambient-color ambient-color-three" />
    </div>
  );
}
