export default function App() {
  return (
    <iframe
      title="FlowIT"
      src={`${import.meta.env.BASE_URL}flowit.html`}
      className="site-frame"
    />
  );
}